<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Mail\SelisihQtyNotification;
use App\Mail\SjValidated;
use App\Models\Batch;
use App\Models\Npn;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\SjValidation;
use App\Models\SjValidationItem;
use App\Models\StandarisasiTumpukan;
use App\Models\StandarUmurProduk;
use App\Models\User;
use App\Services\EmailNotificationService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SjValidationController extends Controller
{
    public function __construct(private EmailNotificationService $emailService) {}

    public function index(Request $request): JsonResponse
    {
        $query = SjValidation::with(['rencanaKirim:id,po_transporter,driver_name,nopol,destination_name', 'validator:id,full_name'])
            ->when($request->user()->isDepotScoped(), fn ($q) => $q->whereHas('rencanaKirim', fn ($s) => $s->forUserDepot($request->user())))
            ->when($request->status, fn ($q) => $q->where('status', $request->status))
            ->when($request->search, function ($q) use ($request) {
                $q->where(function ($qq) use ($request) {
                    $qq->whereHas('rencanaKirim', fn ($s) => $s->where('po_transporter', 'like', "%{$request->search}%"));
                });
            })
            ->orderBy('created_at', 'desc');

        $perPage = $this->perPage($request);

        return response()->json($query->paginate($perPage));
    }

    private function authorizeDepot(SjValidation|RencanaKirim $record): void
    {
        $rk = $record instanceof RencanaKirim ? $record : $record->rencanaKirim;
        abort_unless(
            auth()->user() instanceof User
                && auth()->user()->canAccessDepotRow($rk?->kode_depo, $rk?->nama_depo),
            403,
            'Validasi tidak ditemukan di depo Anda.'
        );
    }

    public function show(SjValidation $sjValidation): JsonResponse
    {
        $this->authorizeDepot($sjValidation);
        $sjValidation->load([
            'rencanaKirim.items.npn',
            'items.npn',
            'items.batch',
            'validator:id,full_name',
        ]);
        $this->attachStandarUmur($sjValidation->items);
        $this->attachStandarisasiTumpukan($sjValidation->items);

        return response()->json(['data' => $sjValidation]);
    }

    /**
     * Lampirkan umur standar (bulan) pada setiap item validasi, diambil dari
     * tabel standar_umur_produk melalui npn.SAPszProductId -> standar_umur_produk.material.
     */
    protected function attachStandarUmur(Collection|iterable $items): void
    {
        $items = collect($items);
        $materials = $items
            ->map(fn (SjValidationItem $it) => $it->npn?->SAPszProductId)
            ->filter()
            ->unique()
            ->values();

        $umurs = StandarUmurProduk::whereIn('material', $materials)
            ->pluck('umur', 'material');

        foreach ($items as $item) {
            /** @var SjValidationItem $item */
            $material = $item->npn?->SAPszProductId;
            $item->umur = $material ? ($umurs[$material] ?? null) : null;
        }
    }

    /**
     * Lampirkan standarisasi tumpukan terakhir (jika sudah pernah tersimpan)
     * pada setiap item validasi (lookup by npn_id) untuk reminder di form.
     */
    protected function attachStandarisasiTumpukan(Collection|iterable $items): void
    {
        $items = collect($items);

        $npnIds = $items
            ->map(fn (SjValidationItem $it) => $it->npn_id)
            ->filter()
            ->unique()
            ->values();

        $stacks = $npnIds->isNotEmpty()
            ? StandarisasiTumpukan::query()
                ->whereIn('npn_id', $npnIds)
                ->orderByDesc('id')
                ->get()
            : collect();

        foreach ($items as $item) {
            /** @var SjValidationItem $item */
            $item->standarisasi = $stacks->firstWhere('npn_id', $item->npn_id) ?? null;
        }
    }

    /**
     * Isi atribut `standarisasi` pada satu item (hasil lookup terbaru).
     */
    protected function standarisasiForItem(SjValidationItem $item): void
    {
        if (! $item->npn_id) {
            $item->standarisasi = null;

            return;
        }

        $item->standarisasi = StandarisasiTumpukan::query()
            ->where('npn_id', $item->npn_id)
            ->orderByDesc('id')
            ->first() ?? null;
    }

    /**
     * Catat/update standarisasi tumpukan dari proses validasi. Dipanggil saat
     * cheker mengisi tier & tinggi karena produk belum punya standarisasi.
     * Update record terbaru (updateOrCreate) agar data tetap segar;
     * status dikunci pending agar menunggu approval admin distributor.
     */
    protected function upsertStandarisasiTumpukan(SjValidationItem $item, User $user, array $data): void
    {
        $tier = (int) ($data['tier'] ?? 0);
        $tinggi = (int) ($data['tinggi_tumpukan'] ?? 0);

        $payload = [
            'tier' => $tier,
            'tinggi_tumpukan' => $tinggi,
            'total_tier_tinggi' => $tier > 0 && $tinggi > 0 ? $tier * $tinggi : null,
            'requested_by' => $user->id,
            'requested_by_email' => $user->email,
            'status' => 'pending',
        ];

        if (! $item->npn_id) {
            return;
        }

        $stack = StandarisasiTumpukan::query()
            ->where('npn_id', $item->npn_id)
            ->orderByDesc('id')
            ->first();

        if ($stack) {
            $stack->update($payload);

            return;
        }

        StandarisasiTumpukan::create(array_merge(
            ['npn_id' => $item->npn_id],
            $payload,
            $user->depotAttributes([])
        ));
    }

    /**
     * Cari rencana kirim berdasarkan scan barcode dokumen (PO Transporter).
     */
    public function lookup(Request $request): JsonResponse
    {
        $request->validate(['scan_code' => 'required|string']);

        $code = trim($request->scan_code);

        $rencanaKirim = RencanaKirim::with(['items.npn', 'creator:id,full_name'])
            ->forUserDepot($request->user())
            ->where('po_transporter', $code)
            ->orderBy('created_at', 'desc')
            ->first();

        if (! $rencanaKirim) {
            return response()->json(['message' => 'Dokumen tidak ditemukan'], 404);
        }

        return response()->json([
            'data' => $rencanaKirim->load('items.npn'),
        ]);
    }

    /**
     * Mulai validasi dari scan code dokumen (PO Transporter).
     * Satu alur: scan -> buka validasi (buat baru atau lanjutkan yang sudah ada).
     */
    public function startByCode(Request $request): JsonResponse
    {
        $request->validate(['scan_code' => 'required|string']);

        $code = trim($request->scan_code);

        $rencanaKirim = RencanaKirim::forUserDepot($request->user())
            ->where('po_transporter', $code)
            ->orderBy('created_at', 'desc')
            ->first();

        if (! $rencanaKirim) {
            return response()->json(['message' => 'Dokumen tidak ditemukan'], 404);
        }

        return $this->startValidation($request, $rencanaKirim);
    }

    /**
     * Mulai validasi: buat record + snapshot semua item rencana kirim.
     */
    public function start(Request $request, RencanaKirim $rencanaKirim): JsonResponse
    {
        $rencanaKirim->load('items.npn');

        return $this->startValidation($request, $rencanaKirim);
    }

    protected function startValidation(Request $request, RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);
        abort_unless(
            in_array($rencanaKirim->status, ['SCHEDULED', 'CHECKED_IN', 'VERIFIED'], true),
            422,
            "Validasi tidak dapat dimulai untuk rencana berstatus {$rencanaKirim->status}."
        );

        $validation = DB::transaction(function () use ($rencanaKirim, $request): SjValidation {
            $lockedRencanaKirim = RencanaKirim::with('items.npn')
                ->lockForUpdate()
                ->findOrFail($rencanaKirim->id);

            $existing = SjValidation::where('rencana_kirim_id', $lockedRencanaKirim->id)
                ->whereIn('status', ['IN_PROGRESS', 'COMPLETED'])
                ->orderBy('id', 'desc')
                ->first();

            if ($existing) {
                return $existing;
            }

            $validation = SjValidation::create([
                'rencana_kirim_id' => $lockedRencanaKirim->id,
                'validated_by' => $request->user()->id,
                'scan_code' => $lockedRencanaKirim->po_transporter,
                'status' => 'IN_PROGRESS',
                'started_at' => now(),
            ]);

            foreach ($lockedRencanaKirim->items as $item) {
                SjValidationItem::create([
                    'sj_validation_id' => $validation->id,
                    'rencana_kirim_item_id' => $item->id,
                    'npn_id' => $item->npn_id,
                    'kode_barang' => $item->kode_barang,
                    'nama_barang' => $item->nama_barang,
                    'expected_qty' => $item->jumlah,
                    'satuan' => $item->satuan,
                    'condition' => 'FISIK_BAGUS',
                    'status' => 'PENDING',
                ]);
            }

            return $validation;
        });

        return $this->show($validation);
    }

    /**
     * Scan barcode produk kemasan + masukkan qty aktual & expired.
     */
    public function scanItem(Request $request, SjValidation $sjValidation): JsonResponse
    {
        $this->authorizeDepot($sjValidation);
        abort_unless(
            $sjValidation->status === 'IN_PROGRESS',
            422,
            "Item hanya dapat divalidasi saat validasi berjalan (saat ini: {$sjValidation->status})."
        );
        $validated = $request->validate([
            'sj_validation_item_id' => 'required|exists:sj_validation_items,id',
            'barcode' => 'nullable|string|max:100',
            'actual_qty' => 'required|numeric|min:0|max:999999',
            'expired_date' => 'nullable|date',
            'condition' => 'nullable|string|in:FISIK_BAGUS,FISIK_RUSAK,QTY_KURANG,ISI_KEMASAN_KURANG,EXPIRED_TIDAK_STANDAR,LAINNYA',
            'notes' => 'nullable|string|max:2000',
            'tier' => 'nullable|integer|min:1|max:9999',
            'tinggi_tumpukan' => 'nullable|integer|min:1|max:9999',
            'photo' => [
                'nullable', 'image', 'mimes:jpg,jpeg,png', 'max:5120',
            ],
        ]);

        // Validasi wajib foto jika kondisi bermasalah
        $conditionsRequiringPhoto = ['FISIK_RUSAK', 'QTY_KURANG', 'ISI_KEMASAN_KURANG', 'EXPIRED_TIDAK_STANDAR', 'LAINNYA'];
        if (in_array($validated['condition'] ?? null, $conditionsRequiringPhoto) && ! $request->hasFile('photo')) {
            return response()->json(['message' => 'Foto wajib diunggah untuk kondisi ini'], 422);
        }

        $item = SjValidationItem::findOrFail($validated['sj_validation_item_id']);
        if ($item->sj_validation_id !== $sjValidation->id) {
            return response()->json(['message' => 'Item tidak sesuai validasi ini'], 422);
        }

        // Barcode bersifat opsional. Jika diisi dan dikenal, gunakan untuk
        // mengunci produk sesuai line SJ (tanpa menolak bila tidak dikenal).
        if (! empty($validated['barcode'])) {
            $barcode = trim($validated['barcode']);
            $npn = Npn::where(function ($q) use ($barcode) {
                $q->where('BOSnetszProductId', $barcode)
                    ->orWhere('SAPszProductId', $barcode)
                    ->orWhere('szBarcode', $barcode)
                    ->orWhere('szBarcodeSekunder', $barcode)
                    ->orWhere('szBarcodeTersier', $barcode);
            })->first();

            if ($npn && (! $item->npn_id || $item->npn_id == $npn->id)) {
                $item->npn_id = $npn->id;
                $item->kode_barang = $npn->BOSnetszProductId;
                $item->save();
            }
        }

        $status = (float) $validated['actual_qty'] === (float) $item->expected_qty
            ? 'VALIDATED'
            : 'MISMATCH';

        $photoPath = null;
        if ($request->hasFile('photo')) {
            $photoPath = $request->file('photo')->store('validation-photos', 'public');
        }

        $item->update([
            'barcode' => $validated['barcode'] ?? $item->barcode,
            'actual_qty' => $validated['actual_qty'],
            'expired_date' => $validated['expired_date'] ?? $item->expired_date,
            'condition' => $validated['condition'] ?? $item->condition,
            'notes' => $validated['notes'] ?? $item->notes,
            'photo' => $photoPath ?? $item->photo,
            'status' => $status,
        ]);

        // Masing-masing produk yang divalidasi mendapat batch number sendiri (siap cetak).
        $existingBatch = Batch::where('sj_validation_item_id', $item->id)->first();
        if (! $existingBatch) {
            Batch::create([
                'batch_number' => Batch::generateNumber('BATCH-'),
                'sj_validation_item_id' => $item->id,
                'barcode_label' => Batch::generateLabel(),
                'items_json' => [[
                    'kode_barang' => $item->kode_barang,
                    'nama_barang' => $item->nama_barang,
                    'actual_qty' => (float) $item->actual_qty,
                    'satuan' => $item->satuan,
                    'barcode' => $item->barcode,
                    'condition' => $item->condition,
                    'expired_date' => $item->expired_date,
                ]],
                'status' => 'ACTIVE',
            ]);
        }

        $item->load('npn');
        $this->attachStandarUmur([$item]);

        // Standarisasi tumpukan: jika frontend mengirim tier/tinggi (produk belum
        // punya standarisasi tersimpan), catat agar tidak diminta berulang.
        if (isset($validated['tier']) || isset($validated['tinggi_tumpukan'])) {
            $this->upsertStandarisasiTumpukan($item, $request->user(), $validated);
        }

        $this->standarisasiForItem($item);

        return response()->json([
            'message' => 'Item divalidasi',
            'data' => $item,
        ]);
    }

    /**
     * Selesaikan validasi dokumen & kirim email ke BLC + CC.
     * Rencana kirim di-set ke VERIFIED agar siap diproses Receiving;
     * COMPLETED rencana kirim ditetapkan dari selesainya proses Receiving (final).
     */
    public function complete(Request $request, SjValidation $sjValidation): JsonResponse
    {
        $this->authorizeDepot($sjValidation);
        abort_unless(
            $sjValidation->status === 'IN_PROGRESS',
            422,
            "Validasi berstatus {$sjValidation->status} tidak dapat diselesaikan."
        );

        $pending = $sjValidation->items()->where('status', 'PENDING')->count();
        if ($pending > 0) {
            return response()->json(['message' => 'Masih ada item yang belum divalidasi ('.$pending.')'], 422);
        }

        $sjValidation->update([
            'status' => 'COMPLETED',
            'completed_at' => now(),
        ]);

        $rencanaKirim = $sjValidation->rencanaKirim;

        // Maju satu arah saja: hanya dari CHECKED_IN ke VERIFIED.
        // Jangan memundurkan rencana yang sudah IN_PROGRESS/COMPLETED.
        if ($rencanaKirim->status === 'CHECKED_IN') {
            $rencanaKirim->update([
                'status' => 'VERIFIED',
                'verified_at' => now(),
            ]);
        }

        // Auto-create Receiving + ReceivingItems dari data validasi
        $receiving = Receiving::where('rencana_kirim_id', $rencanaKirim->id)
            ->whereIn('status', ['PENDING', 'IN_PROGRESS'])
            ->first();

        if (! $receiving) {
            $validationItems = $sjValidation->items()->get();

            $receiving = Receiving::create([
                'rencana_kirim_id' => $rencanaKirim->id,
                'total_expected_qty' => $validationItems->sum('expected_qty'),
                'total_received_qty' => $validationItems->sum('actual_qty'),
                'status' => 'PENDING',
                'checked_by' => $sjValidation->validated_by,
            ]);

            foreach ($validationItems as $svItem) {
                $selisihQty = (float) $svItem->actual_qty - (float) $svItem->expected_qty;
                $selisihReason = $selisihQty != 0 ? match ($svItem->condition) {
                    'FISIK_RUSAK' => 'Barang rusak',
                    'QTY_KURANG' => 'Qty kurang dari rencana',
                    'ISI_KEMASAN_KURANG' => 'Isi kemasan kurang',
                    'EXPIRED_TIDAK_STANDAR' => 'Expired tidak standar',
                    'LAINNYA' => 'Lainnya',
                    default => 'Selisih qty',
                } : null;

                ReceivingItem::create([
                    'receiving_id' => $receiving->id,
                    'sj_validation_item_id' => $svItem->id,
                    'rencana_kirim_item_id' => $svItem->rencana_kirim_item_id,
                    'kode_barang' => $svItem->kode_barang,
                    'nama_barang' => $svItem->nama_barang,
                    'expected_qty' => $svItem->expected_qty,
                    'actual_qty' => $svItem->actual_qty,
                    'satuan' => $svItem->satuan,
                    'condition' => $svItem->condition ?? 'FISIK_BAGUS',
                    'expired_date' => $svItem->expired_date,
                    'barcode' => $svItem->barcode,
                    'selisih_qty' => $selisihQty,
                    'selisih_reason' => $selisihReason,
                    'validated_by' => $sjValidation->validated_by,
                    'notes' => $svItem->notes,
                    'photo' => $svItem->photo,
                ]);
            }
        }

        $this->emailService->send(
            'sj_ba',
            'validated',
            $rencanaKirim->fresh(),
            new SjValidated($rencanaKirim->fresh(), $sjValidation->fresh('items'))
        );

        // Kirim notif selisih qty jika ada
        $receivingItems = $receiving->items()->where('selisih_qty', '!=', 0)->get();
        if ($receivingItems->isNotEmpty()) {
            $this->emailService->send(
                'selisih',
                'selisih_qty',
                $rencanaKirim->fresh(),
                new SelisihQtyNotification($rencanaKirim->fresh(), $receivingItems)
            );
        }

        return response()->json([
            'message' => 'Validasi selesai',
            'data' => $sjValidation->fresh(['rencanaKirim.items.npn', 'items.batch', 'validator:id,full_name']),
        ]);
    }

    /**
     * Hapus satu item validasi beserta batch-nya (untuk salah input / line tidak perlu).
     */
    public function deleteItem(Request $request, SjValidation $sjValidation, mixed $item): JsonResponse
    {
        $this->authorizeDepot($sjValidation);
        abort_unless(
            $sjValidation->status === 'IN_PROGRESS',
            422,
            "Item hanya dapat dihapus saat validasi berjalan (saat ini: {$sjValidation->status})."
        );
        $row = SjValidationItem::findOrFail($item);
        if ($row->sj_validation_id !== $sjValidation->id) {
            return response()->json(['message' => 'Item tidak sesuai validasi ini'], 422);
        }

        Batch::where('sj_validation_item_id', $row->id)->delete();
        $row->delete();

        $sjValidation->unsetRelation('items');

        return $this->show($sjValidation);
    }

    public function cancel(Request $request, SjValidation $sjValidation): JsonResponse
    {
        $this->authorizeDepot($sjValidation);
        abort_unless(
            $sjValidation->status === 'IN_PROGRESS',
            422,
            "Validasi berstatus {$sjValidation->status} tidak dapat dibatalkan."
        );

        DB::transaction(function () use ($sjValidation) {
            $sjValidation->update(['status' => 'CANCELLED']);
            Batch::whereIn(
                'sj_validation_item_id',
                $sjValidation->items()->pluck('id')
            )->update(['status' => 'CANCELLED']);
        });

        return response()->json(['message' => 'Validasi dibatalkan', 'data' => $sjValidation->refresh()]);
    }
}
