<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\RencanaKirimItemTemplate;
use App\Exports\RencanaKirimTemplate;
use App\Http\Controllers\Concerns\AuthorizesDepotRow;
use App\Http\Controllers\Controller;
use App\Imports\RencanaKirimImport;
use App\Imports\RencanaKirimItemImport;
use App\Mail\RencanaKirimCancelled;
use App\Mail\RencanaKirimCreated;
use App\Models\Npn;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\SjValidation;
use App\Models\StandarUmurProduk;
use App\Services\EmailNotificationService;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;

class RencanaKirimController extends Controller
{
    use AuthorizesDepotRow;

    private const TRANSITIONS = [
        'DRAFT' => ['SCHEDULED', 'CANCELLED'],
        'SCHEDULED' => ['CHECKED_IN', 'CANCELLED'],
        'CHECKED_IN' => ['VERIFIED', 'CANCELLED'],
        'VERIFIED' => ['IN_PROGRESS', 'CANCELLED'],
        'IN_PROGRESS' => ['COMPLETED', 'CANCELLED'],
        'COMPLETED' => [],
        'CANCELLED' => [],
    ];

    public function __construct(private EmailNotificationService $emailService) {}

    /**
     * Lampirkan umur standar (bulan) pada setiap item rencana kirim, diambil dari
     * tabel standar_umur_produk melalui npn.SAPszProductId -> standar_umur_produk.material.
     */
    /**
     * @param  iterable<int, RencanaKirimItem>  $items
     */
    protected function attachStandarUmur(iterable $items): void
    {
        $items = collect($items);
        $materials = $items
            ->map(fn (RencanaKirimItem $it) => $it->npn?->SAPszProductId)
            ->filter()
            ->unique()
            ->values();

        $umurs = StandarUmurProduk::whereIn('material', $materials)
            ->pluck('umur', 'material');

        foreach ($items as $item) {
            /** @var RencanaKirimItem $item */
            $material = $item->npn?->SAPszProductId;
            $item->umur = $material ? ($umurs[$material] ?? null) : null;
        }
    }

    private function assertTransition(RencanaKirim $rencanaKirim, string $target): void
    {
        $allowed = self::TRANSITIONS[$rencanaKirim->status] ?? [];
        if (! in_array($target, $allowed, true)) {
            abort(422, "Transisi tidak valid: {$rencanaKirim->status} → {$target}");
        }
    }

    private function authorizeDepot(RencanaKirim $rencanaKirim): void
    {
        $this->authorizeDepotRow(
            $rencanaKirim->kode_depo,
            $rencanaKirim->nama_depo,
            'Rencana kirim tidak ditemukan di depo Anda.'
        );
    }

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'status' => 'nullable|string|in:DRAFT,SCHEDULED,CHECKED_IN,VERIFIED,IN_PROGRESS,COMPLETED,CANCELLED',
        ]);

        $query = RencanaKirim::with(['items.npn', 'creator'])->forUserDepot($request->user());

        if ($request->search) {
            $like = '%'.addcslashes($request->search, '\\%_').'%';
            $query->where(function ($q) use ($like) {
                $q->whereRaw('po_transporter LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('driver_name LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('nopol LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('destination_name LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        // Pencocokan PO persis (case-insensitive, portabel antar driver DB) — dipakai
        // frontend sebagai early-warning duplikat sebelum menyimpan.
        if ($request->filled('po_transporter')) {
            $query->whereRaw('LOWER(po_transporter) = LOWER(?)', [trim((string) $request->input('po_transporter'))]);
        }

        if ($request->filled('kode_depo')) {
            $query->where('kode_depo', $request->input('kode_depo'));
        }

        if ($request->status) {
            $query->where('status', $request->status);
        }

        if ($request->date_from) {
            $query->where('rkh_date', '>=', $request->date_from);
        }

        if ($request->date_to) {
            $query->where('rkh_date', '<=', $request->date_to);
        }

        $perPage = $this->perPage($request);
        $rencana_kirim = $query->orderBy('created_at', 'desc')->paginate($perPage);

        foreach ($rencana_kirim as $rencanaKirim) {
            $this->attachStandarUmur($rencanaKirim->items);
            $this->attachKubikasi($rencanaKirim->items);
            $rencanaKirim->total_kubikasi = $this->totalKubikasi($rencanaKirim->items);
        }

        return response()->json($rencana_kirim);
    }

    public function store(Request $request): JsonResponse
    {
        // Normalisasi identifier PO (memudahkan deteksi duplikat antar engine DB).
        $request->merge(['po_transporter' => self::normalizePoTransporter((string) $request->input('po_transporter'))]);

        $validated = $request->validate([
            'po_transporter' => [
                'required', 'string', 'max:100',
                Rule::unique('rencana_kirim', 'po_transporter')->where(function ($query) use ($request) {
                    // Depo efektif: depot-scoped terkunci ke depo user; admin view_all memakai depo yang diminta.
                    $kodeDepo = $request->user()->isDepotScoped()
                        ? $request->user()->kode_depo
                        : $request->input('kode_depo');

                    // Case-insensitive agar portabel antar driver DB (MySQL & sqlite).
                    return $query->where('kode_depo', $kodeDepo)
                        ->whereRaw('LOWER(po_transporter) = LOWER(?)', [$request->input('po_transporter')]);
                }),
            ],
            'rkh_date' => 'nullable|date|after_or_equal:today',
            'driver_name' => 'nullable|string|max:100',
            'nopol' => 'nullable|string|max:50',
            'jenis_kendaraan' => 'nullable|string|max:50',
            'expedisi' => 'nullable|string|max:100',
            'shipper_name' => 'nullable|string|max:200',
            'shipper_address' => 'nullable|string',
            'shipper_phone' => 'nullable|string|max:50',
            'destination_name' => 'nullable|string|max:200',
            'destination_address' => 'nullable|string',
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
            'scheduled_at' => 'nullable|date',
            'items' => 'nullable|array',
            'items.*.item_number' => 'required_with:items|integer',
            'items.*.npn_id' => 'nullable|integer|exists:npn,id',
            'items.*.kode_barang' => 'nullable|string|max:50',
            'items.*.nama_barang' => 'required_with:items|string|max:200',
            'items.*.jumlah' => 'required_with:items|numeric|min:1',
            'items.*.satuan' => 'nullable|string|max:20',
            'items.*.keterangan' => 'nullable|string',
        ], [
            'po_transporter.unique' => 'PO Transporter ini sudah dipakai pada rencana kirim lain di depo yang sama.',
            'rkh_date.after_or_equal' => 'Tanggal RKH tidak boleh di masa lalu.',
        ]);

        $validated['created_by'] = $request->user()->id;
        $validated['status'] = 'DRAFT';
        $validated['jenis_kendaraan'] ??= null;
        $validated = $request->user()->depotAttributes($validated);

        $items = null;
        if (isset($validated['items'])) {
            $items = $this->normalizeItemsFromNpn($validated['items']);
            $this->assertItemsHaveProductCode($items);
            unset($validated['items']);
        }

        // Header + items ditulis atomik: sebagian item tanpa header (atau sebaliknya)
        // akan merusak total_qty dan acuan validasi SJ.
        try {
            $rencanaKirim = DB::transaction(function () use ($validated, $items) {
                $rencanaKirim = RencanaKirim::create($validated);

                if (isset($items)) {
                    $totalQty = 0;
                    foreach ($items as $item) {
                        $item['rencana_kirim_id'] = $rencanaKirim->id;
                        RencanaKirimItem::create($item);
                        $totalQty += $item['jumlah'];
                    }
                    $rencanaKirim->update(['total_qty' => $totalQty]);
                }

                return $rencanaKirim;
            });
        } catch (QueryException $e) {
            abort_if($this->isDuplicateKey($e), 422, 'PO Transporter ini sudah dipakai pada rencana kirim lain di depo yang sama.');
            throw $e;
        }

        $rencanaKirim->load('items.npn');
        $this->attachStandarUmur($rencanaKirim->items);
        $this->attachKubikasi($rencanaKirim->items);
        $rencanaKirim->total_kubikasi = $this->totalKubikasi($rencanaKirim->items);

        return response()->json([
            'message' => 'Rencana kirim berhasil dibuat',
            'data' => $rencanaKirim,
        ], 201);
    }

    public function show(RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);
        $rencanaKirim->load(['items.npn', 'gateTransactions', 'receivings.items.rencanaKirimItem.npn', 'creator']);
        $this->attachStandarUmur($rencanaKirim->items);
        $this->attachKubikasi($rencanaKirim->items);
        $rencanaKirim->total_kubikasi = $this->totalKubikasi($rencanaKirim->items);

        return response()->json(['data' => $rencanaKirim]);
    }

    public function update(Request $request, RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);
        // Edit hanya sah selama belum dieksekusi: setelah CHECKED_IN, item menjadi acuan
        // validasi SJ & receiving — mengubah dokumen/barang berarti memalsukan acuan.
        abort_unless(
            in_array($rencanaKirim->status, ['DRAFT', 'SCHEDULED'], true),
            422,
            "Rencana kirim berstatus {$rencanaKirim->status} tidak dapat diedit."
        );
        // Pindah depo = ubah kepemilikan/audit dokumen: hanya admin_master.
        // Cek unik PO di bawah memakai depo TUJUAN agar duplikat di depo
        // tujuan tidak lolos via celah "cek ke depo asal".
        $targetDepo = $rencanaKirim->kode_depo;
        if ($request->filled('kode_depo') && $request->input('kode_depo') !== $rencanaKirim->kode_depo) {
            // User scoped: depo di-strip diam-diam di bawah (kontrak lama:
            // 200 + field lain tetap diterapkan). Yang ditolak tegas hanya
            // pemegang depot.view_all non-admin.
            abort_unless(
                $request->user()->isDepotScoped() || $request->user()->isAdminMaster(),
                403,
                'Hanya admin master yang dapat memindahkan dokumen antar depo.'
            );
            $targetDepo = $request->user()->isAdminMaster() ? $request->input('kode_depo') : $targetDepo;
        }
        // Sesi validasi yang sedang berjalan memakai snapshot item sebagai
        // acuan cheker. Edit APAPUN (termasuk header seperti driver_name)
        // di tengah jalan membuat acuan berubah diam-diam — blokir seluruh
        // update selama ada sesi IN_PROGRESS; batalkan sesi dulu bila perlu.
        abort_if(
            SjValidation::where('rencana_kirim_id', $rencanaKirim->id)
                ->where('status', 'IN_PROGRESS')
                ->exists(),
            422,
            'Rencana kirim sedang divalidasi sehingga tidak dapat diedit. Batalkan sesi validasi terlebih dahulu bila ada perubahan.');
        if ($request->filled('po_transporter')) {
            $request->merge(['po_transporter' => self::normalizePoTransporter((string) $request->input('po_transporter'))]);
        }

        $validated = $request->validate([
            'po_transporter' => [
                'sometimes', 'required', 'string', 'max:100',
                Rule::unique('rencana_kirim', 'po_transporter')
                    ->where(fn ($query) => $query
                        ->where('kode_depo', $targetDepo)
                        ->whereRaw('LOWER(po_transporter) = LOWER(?)', [$request->input('po_transporter')]))
                    ->ignore($rencanaKirim->id),
            ],
            // Saat edit, tanggal lampau yang sudah tersimpan tetap sah (tidak dipaksa mundur);
            // yang ditolak hanya perubahan rkh_date ke tanggal lampau (after_or_equal).
            'rkh_date' => 'nullable|date|after_or_equal:today',
            'driver_name' => 'nullable|string|max:100',
            'nopol' => 'nullable|string|max:50',
            'jenis_kendaraan' => 'nullable|string|max:50',
            'expedisi' => 'nullable|string|max:100',
            'shipper_name' => 'nullable|string|max:200',
            'shipper_address' => 'nullable|string',
            'shipper_phone' => 'nullable|string|max:50',
            'destination_name' => 'nullable|string|max:200',
            'destination_address' => 'nullable|string',
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
            'scheduled_at' => 'nullable|date',
            'items' => 'nullable|array',
            'items.*.item_number' => 'required_with:items|integer',
            'items.*.npn_id' => 'nullable|integer|exists:npn,id',
            'items.*.kode_barang' => 'nullable|string|max:50',
            'items.*.nama_barang' => 'required_with:items|string|max:200',
            'items.*.jumlah' => 'required_with:items|numeric|min:1',
            'items.*.satuan' => 'nullable|string|max:20',
            'items.*.keterangan' => 'nullable|string',
        ]);

        // rkh_date: hapus dulu dari validated (rule after_or_equal menolak tanggal lampau
        // yang tersimpan). Kembali hanya bila user benar-benar mengubahnya — sehingga RK
        // ber-tanggal lampau tetap bisa diedit tanpa dipaksa mundur.
        $validated = collect($validated)->except('rkh_date')->all();
        if ($request->filled('rkh_date')) {
            $newDate = substr((string) $request->input('rkh_date'), 0, 10);
            $oldDate = substr((string) $rencanaKirim->rkh_date, 0, 10);
            if ($newDate !== $oldDate) {
                $validated['rkh_date'] = $request->input('rkh_date');
            }
        }

        $items = null;
        if (isset($validated['items'])) {
            $items = $this->normalizeItemsFromNpn($validated['items']);
            $this->assertItemsHaveProductCode($items);
            unset($validated['items']);
        }

        // User depot-scoped tidak boleh memindahkan dokumen ke depo lain
        // lewat update: buang dari validated sehingga depo tersimpan utuh.
        // (Pindah depo oleh non-admin sudah ditolak 403 di atas.)
        if ($request->user()->isDepotScoped()) {
            unset($validated['kode_depo'], $validated['nama_depo']);
        }

        // Header + items (delete-all lalu insert ulang) ditulis atomik: kegagalan di
        // tengah jalan tidak boleh meninggalkan item baru dengan total_qty lama.
        try {
            DB::transaction(function () use ($rencanaKirim, $validated, $items) {
                $rencanaKirim->update($validated);

                if (isset($items)) {
                    $rencanaKirim->items()->delete();
                    $totalQty = 0;
                    foreach ($items as $item) {
                        $item['rencana_kirim_id'] = $rencanaKirim->id;
                        RencanaKirimItem::create($item);
                        $totalQty += $item['jumlah'];
                    }
                    $rencanaKirim->update(['total_qty' => $totalQty]);
                }
            });
        } catch (QueryException $e) {
            abort_if($this->isDuplicateKey($e), 422, 'PO Transporter ini sudah dipakai pada rencana kirim lain di depo yang sama.');
            throw $e;
        }

        $rencanaKirim->load('items.npn');
        $this->attachStandarUmur($rencanaKirim->items);
        $this->attachKubikasi($rencanaKirim->items);
        $rencanaKirim->total_kubikasi = $this->totalKubikasi($rencanaKirim->items);

        return response()->json([
            'message' => 'Rencana kirim berhasil diperbarui',
            'data' => $rencanaKirim,
        ]);
    }

    public function destroy(RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);
        // Hapus hanya sah sebelum dokumen dieksekusi — menjaga jejak audit alur gate →
        // validasi SJ → receiving.
        abort_unless(
            in_array($rencanaKirim->status, ['DRAFT', 'CANCELLED'], true),
            422,
            "Rencana kirim berstatus {$rencanaKirim->status} tidak dapat dihapus."
        );

        DB::transaction(function () use ($rencanaKirim): void {
            $locked = RencanaKirim::whereKey($rencanaKirim->id)->lockForUpdate()->firstOrFail();
            abort_unless(
                in_array($locked->status, ['DRAFT', 'CANCELLED'], true),
                422,
                "Rencana kirim berstatus {$locked->status} tidak dapat dihapus."
            );
            $locked->items()->delete();
            $locked->delete();
        });

        return response()->json(['message' => 'Rencana kirim berhasil dihapus']);
    }

    public function schedule(RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);

        $rencanaKirim = DB::transaction(function () use ($rencanaKirim): RencanaKirim {
            $locked = RencanaKirim::whereKey($rencanaKirim->id)->lockForUpdate()->firstOrFail();
            $this->assertTransition($locked, 'SCHEDULED');
            $locked->update([
                'status' => 'SCHEDULED',
                'scheduled_at' => now(),
            ]);

            $this->emailService->send(
                'rencana_kirim',
                'created',
                $locked,
                new RencanaKirimCreated($locked->fresh(['items', 'creator']))
            );

            return $locked;
        });

        return response()->json([
            'message' => 'Rencana kirim berhasil dijadwalkan',
            'data' => $rencanaKirim,
        ]);
    }

    public function verify(RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);

        $rencanaKirim = DB::transaction(function () use ($rencanaKirim): RencanaKirim {
            $locked = RencanaKirim::whereKey($rencanaKirim->id)->lockForUpdate()->firstOrFail();
            $this->transitionRencanaKirim($locked, 'VERIFIED');

            return $locked;
        });

        return response()->json([
            'message' => 'Rencana kirim berhasil diverifikasi',
            'data' => $rencanaKirim,
        ]);
    }

    private function normalizeItemsFromNpn(array $items): array
    {
        // Muat master sekali (bukan 1 query per baris): peta by id + by nama.
        // `first` koleksi mengikuti urutan query = semantik `->first()` semula.
        $ids = collect($items)->pluck('npn_id')->filter()->unique()->values();
        $names = collect($items)->pluck('nama_barang')->filter()->unique()->values();
        $byId = Npn::whereIn('id', $ids)->get()->keyBy('id');
        $candidates = Npn::query()
            ->where(fn ($q) => $q->whereIn('szNickName', $names)->orWhereIn('szNickNameNew', $names))
            ->get();
        $byName = [];
        foreach ($names as $name) {
            $byName[$name] = $candidates->first(
                fn (Npn $n) => $n->szNickName === $name || $n->szNickNameNew === $name
            );
        }

        return array_map(function (array $item) use ($byId, $byName): array {
            $product = ! empty($item['npn_id'])
                ? ($byId[$item['npn_id']] ?? null)
                : ($byName[$item['nama_barang'] ?? ''] ?? null);

            if ($product) {
                $item['npn_id'] = $product->id;
                $item['kode_barang'] = $product->BOSnetszProductId;
            }

            return $item;
        }, $items);
    }

    private function assertItemsHaveProductCode(array $items): void
    {
        if (collect($items)->contains(fn (array $item): bool => blank($item['kode_barang'] ?? null))) {
            throw ValidationException::withMessages([
                'items' => ['Setiap barang harus ditemukan di NPN dan memiliki Kode Barang.'],
            ]);
        }
    }

    public function cancel(RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);

        $rencanaKirim = DB::transaction(function () use ($rencanaKirim): RencanaKirim {
            $locked = RencanaKirim::whereKey($rencanaKirim->id)->lockForUpdate()->firstOrFail();
            $this->transitionRencanaKirim($locked, 'CANCELLED');

            $this->emailService->send(
                'rencana_kirim',
                'cancelled',
                $locked,
                new RencanaKirimCancelled($locked->fresh(['items', 'creator']))
            );

            return $locked;
        });

        return response()->json([
            'message' => 'Rencana kirim berhasil dibatalkan',
            'data' => $rencanaKirim,
        ]);
    }

    /**
     * Hitung total kubikasi (m3) dari kumpulan item. Kubikasi bukan kolom DB —
     * ia atribut transient (volume x qty) yang dihitung dari data NPN.
     *
     * @param  iterable<int, RencanaKirimItem>  $items
     */
    /**
     * Execute status transition using the TRANSITIONS matrix.
     * Centralizes state machine logic so all transitions go through one source of truth.
     */
    private function transitionRencanaKirim(RencanaKirim $rencanaKirim, string $target): void
    {
        $this->assertTransition($rencanaKirim, $target);
        $rencanaKirim->update(['status' => $target]);
    }

    public static function normalizePoTransporter(string $value): string
    {
        return strtoupper(trim($value));
    }

    /**
     * True bila exception adalah pelanggaran unique constraint (race
     * check-then-insert lolos dua-duanya; backstop DB rk_depo_po_unique
     * yang bicara). Portabel MySQL (1062) & SQLite (19).
     */
    private function isDuplicateKey(QueryException $e): bool
    {
        $code = (string) $e->getCode();

        return $code === '23000' || str_contains(strtolower($e->getMessage()), 'duplicate');
    }

    private function totalKubikasi(iterable $items): float
    {
        $sum = 0.0;
        foreach ($items as $item) {
            $sum += (float) ($item->kubikasi ?? 0);
        }

        return $sum;
    }

    /**
     * Lampirkan kubikasi transient pada setiap item rencana kirim:
     * jumlah x decVolume x SAPdecUom / 1.000.000 (m3).
     *
     * @param  iterable<int, RencanaKirimItem>  $items
     */
    protected function attachKubikasi(iterable $items): void
    {
        foreach ($items as $item) {
            /** @var RencanaKirimItem $item */
            $volume = $item->npn?->decVolume;
            $uom = $item->npn?->SAPdecUom;
            $item->kubikasi = ($volume !== null && $uom !== null)
                ? round(((float) $item->jumlah) * ((float) $volume) * ((float) $uom) / 1_000_000, 4)
                : null;
        }
    }

    /**
     * Statistik global rencana kirim: hitungan per status, total, dan
     * agregat kalender (rkh_date x status) untuk dashboard halaman.
     *
     * Semua ringkasan dihitung dengan agregasi SQL — tabel tidak pernah
     * dimuat seluruhnya ke memori.
     */
    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();
        $base = RencanaKirim::forUserDepot($user)
            ->when(
                ! $user->isDepotScoped() && trim((string) $request->input('kode_depo', '')) !== '',
                fn ($query) => $query->where('kode_depo', trim((string) $request->input('kode_depo', '')))
            );

        $statuses = ['DRAFT', 'SCHEDULED', 'CHECKED_IN', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

        $perStatus = (clone $base)->toBase()
            ->selectRaw('status, COUNT(*) as c, COALESCE(SUM(total_qty), 0) as q')
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        // Kubikasi per item = jumlah x npn.decVolume x npn.SAPdecUom / 1.000.000
        // (rumus sama dengan attachKubikasi; NULL = 0), diagregasi per status.
        $headers = (clone $base)->toBase()->select('rencana_kirim.id', 'rencana_kirim.status');
        $kubikasi = DB::table('rencana_kirim_items as i')
            ->join('npn as n', 'n.id', '=', 'i.npn_id')
            ->joinSub($headers, 'h', 'h.id', '=', 'i.rencana_kirim_id')
            ->selectRaw('h.status as status, COALESCE(SUM(ROUND(COALESCE(i.jumlah, 0) * COALESCE(n.decVolume, 0) * COALESCE(CAST(n.SAPdecUom AS DOUBLE), 0) / 1000000, 4)), 0) as k')
            ->groupBy('h.status')
            ->pluck('k', 'status');

        $stats = [];
        $totalKubikasi = 0.0;
        foreach ($statuses as $status) {
            $k = (float) ($kubikasi[$status] ?? 0);
            $totalKubikasi += $k;
            $stats[$status] = [
                'count' => (int) ($perStatus[$status]->c ?? 0),
                'sum_qty' => (int) ($perStatus[$status]->q ?? 0),
                'sum_kubikasi' => round($k, 2),
            ];
        }

        $today = now()->toDateString();

        $calendarRows = (clone $base)->toBase()
            ->selectRaw('DATE(rkh_date) as d, status, COUNT(*) as c')
            ->groupBy('d', 'status')
            ->orderByDesc('d')
            ->get();

        $byDate = [];
        foreach ($calendarRows as $row) {
            $date = $row->d ?? '';
            $byDate[$date]['count'] = ($byDate[$date]['count'] ?? 0) + (int) $row->c;
            $byDate[$date]['breakdown'][$row->status] = (int) $row->c;
        }
        krsort($byDate);
        $calendar = [];
        foreach ($byDate as $date => $entry) {
            $calendar[] = ['date' => $date, 'count' => $entry['count'], 'breakdown' => $entry['breakdown']];
        }

        return response()->json([
            'data' => $stats,
            'total' => (int) (clone $base)->toBase()->count(),
            'total_qty' => (int) (clone $base)->sum('total_qty'),
            'total_kubikasi' => round($totalKubikasi, 2),
            'today_count' => (int) (clone $base)->whereDate('rkh_date', $today)->count(),
            'calendar' => $calendar,
        ]);
    }

    public function template()
    {
        return Excel::download(new RencanaKirimTemplate, 'rencana_kirim_template.xlsx');
    }

    public function import(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv|max:10240']);

        try {
            $import = new RencanaKirimImport($request->user());
            Excel::import($import, $request->file('file'));

            return response()->json([
                'message' => 'Import berhasil',
                'data' => [
                    'total_rows' => $import->totalRows,
                    'imported' => $import->imported,
                    'skipped' => $import->skipped,
                    'errors' => $import->errors,
                ],
            ]);
        } catch (\Exception $e) {
            Log::error('rencana_kirim import failed', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Import gagal. Silakan periksa file dan coba lagi.'], 500);
        }
    }

    public function itemTemplate()
    {
        return Excel::download(new RencanaKirimItemTemplate, 'rencana_kirim_item_template.xlsx');
    }

    /**
     * Import item dari Excel untuk form create/edit rencana kirim — mengembalikan
     * daftar item hasil resolusi NPN (tanpa menyimpan ke DB).
     */
    public function importItems(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv|max:10240']);

        try {
            $import = new RencanaKirimItemImport;
            Excel::import($import, $request->file('file'));
        } catch (\Exception $e) {
            Log::error('rencana_kirim import failed', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Import gagal. Silakan periksa file dan coba lagi.'], 500);
        }

        return response()->json([
            'message' => $import->matched > 0 ? 'Import berhasil' : 'Tidak ada barang yang cocok',
            'data' => [
                'total_rows' => $import->totalRows,
                'matched' => $import->matched,
                'skipped' => $import->skipped,
                'items' => $import->items,
            ],
        ]);
    }
}
