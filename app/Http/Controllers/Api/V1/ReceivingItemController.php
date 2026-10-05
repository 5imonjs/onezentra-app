<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\ReceivingItemTemplate;
use App\Http\Controllers\Controller;
use App\Imports\ReceivingItemImport;
use App\Models\Npn;
use App\Models\ReceivingItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;
use Maatwebsite\Excel\Validators\ValidationException as ExcelValidationException;

class ReceivingItemController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ReceivingItem::with(['receiving.rencanaKirim', 'batch'])
            ->orderByDesc('created_at');

        if ($request->user()->isDepotScoped()) {
            $query->where(fn ($q) => $q
                ->where('kode_depo', $request->user()->kode_depo)
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r->forUserDepot($request->user())));
        }

        if ($request->source) {
            $query->where('source', $request->source);
        }

        if ($request->search) {
            $like = "%{$request->search}%";
            $query->where(fn ($q) => $q
                ->where('kode_barang', 'like', $like)
                ->orWhere('nama_barang', 'like', $like)
                ->orWhere('sumber_material', 'like', $like)
                // Kolom di induk: placeholder UI menjanjikan pencarian PO & driver.
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r
                    ->where('po_transporter', 'like', $like)
                    ->orWhere('driver_name', 'like', $like)));
        }

        if ($request->kode_depo && ! $request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->kode_depo);
        }

        $perPage = $this->perPage($request);
        $items = $query->paginate($perPage);

        return response()->json($items);
    }

    /**
     * Daftar penerimaan terpaginasi PER GROUP (satu receiving SJ / satu tanggal
     * untuk item manual). Group selalu utuh — tidak mungkin terpotong halaman —
     * dan urutan item di dalam group diurutkan dari item terbaru.
     *
     * Query params: search, page, per_page (jumlah GROUP per halaman).
     */
    public function groups(Request $request): JsonResponse
    {
        $base = ReceivingItem::query()
            ->where('source', ReceivingItem::SOURCE_VALIDASI);

        if ($request->user()->isDepotScoped()) {
            $base->where(fn ($q) => $q
                ->where('kode_depo', $request->user()->kode_depo)
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r->forUserDepot($request->user())));
        }

        if ($request->search) {
            $like = "%{$request->search}%";
            $base->where(fn ($q) => $q
                ->where('kode_barang', 'like', $like)
                ->orWhere('nama_barang', 'like', $like)
                ->orWhere('sumber_material', 'like', $like)
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r
                    ->where('po_transporter', 'like', $like)
                    ->orWhere('driver_name', 'like', $like)));
        }

        if ($request->kode_depo && ! $request->user()->isDepotScoped()) {
            $base->where('kode_depo', $request->kode_depo);
        }

        // Kunci bucket dibangun di PHP (bukan SQL raw) agar portabel antar
        // database: R{receiving_id}|{depo} untuk item ber-receiving, atau
        // D{tanggal}|{depo} untuk item tanpa receiving (manual/legacy).
        // Nilai tanggal dinormalisasi manual: tergantung driver DB, atribut bisa
        // datang sebagai Carbon atau string, jadi jangan mengandalkan cast.
        $toDateString = fn ($value): ?string => $value === null
            ? null
            : ($value instanceof \DateTimeInterface ? $value->format('Y-m-d') : substr((string) $value, 0, 10));

        $rows = (clone $base)
            ->select('id', 'receiving_id', 'kode_depo', 'tanggal_penerimaan', 'created_at')
            ->orderByDesc('created_at')
            ->get();

        $perPage = $this->perPage($request);
        $page = max(1, (int) $request->query('page', '1'));

        // Kandidat group dihitung SEBELUM pagination; kemunculan pertama baris
        // terbaru = wakil terbaru group (urutan group: yang terbaru dulu).
        $candidates = [];
        $seen = [];
        foreach ($rows as $row) {
            $kodeDepo = $row->getRawOriginal('kode_depo');
            $depoKey = $kodeDepo ?? '';
            if ($row->receiving_id !== null) {
                $key = 'R'.$row->receiving_id;
                $tanggal = $toDateString($row->tanggal_penerimaan);
            } else {
                $tanggal = $toDateString($row->tanggal_penerimaan ?? $row->created_at);
                $key = 'D'.$tanggal.'|'.$depoKey;
            }
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;
            $candidates[] = [
                'key' => $key,
                'receiving_id' => $row->receiving_id,
                'kode_depo' => $kodeDepo,
                'tanggal' => $tanggal,
            ];
        }

        $total = count($candidates);
        $pageCandidates = array_slice($candidates, ($page - 1) * $perPage, $perPage);

        if ($pageCandidates === []) {
            return response()->json([
                'data' => [],
                'meta' => [
                    'total' => $total, 'per_page' => $perPage, 'current_page' => $page,
                    'last_page' => max(1, (int) ceil($total / $perPage)), 'from' => null, 'to' => null,
                ],
            ]);
        }

        // Item dimuat sekaligus untuk semua group di halaman ini (1 query,
        // tanpa N+1), lalu dikelompokkan di memori.
        // `batch` di-eager-load supaya halaman Inbound bisa mencetak label ulang.
        // Batch label lahir di tahap validasi SJ, tapi dicetak ulang justru paling
        // sering dibutuhkan saat barang masuk — label harus ditempel di rak.
        $itemsQuery = ReceivingItem::query()->with(['receiving.rencanaKirim', 'batch'])
            ->where(function ($q) use ($pageCandidates) {
                foreach ($pageCandidates as $b) {
                    $q->orWhere(function ($sub) use ($b) {
                        if ($b['receiving_id'] !== null) {
                            $sub->where('receiving_id', $b['receiving_id']);
                        } else {
                            $sub->whereNull('receiving_id')
                                ->where(function ($dateQ) use ($b) {
                                    $dateQ->whereDate('tanggal_penerimaan', $b['tanggal'])
                                        ->orWhere(function ($subDate) use ($b) {
                                            $subDate->whereNull('tanggal_penerimaan')
                                                ->whereDate('created_at', $b['tanggal']);
                                        });
                                });
                            if ($b['kode_depo'] !== null) {
                                $sub->where('kode_depo', $b['kode_depo']);
                            } else {
                                $sub->whereNull('kode_depo');
                            }
                        }
                    });
                }
            });

        // Terapkan ulang scoping + search pada loader agar item yang tampil
        // konsisten dengan kandidat yang dihitung.
        if ($request->user()->isDepotScoped()) {
            $itemsQuery->where(fn ($q) => $q
                ->where('kode_depo', $request->user()->kode_depo)
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r->forUserDepot($request->user())));
        }
        if ($request->search) {
            $like = "%{$request->search}%";
            $itemsQuery->where(fn ($q) => $q
                ->where('kode_barang', 'like', $like)
                ->orWhere('nama_barang', 'like', $like)
                ->orWhere('sumber_material', 'like', $like)
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r
                    ->where('po_transporter', 'like', $like)
                    ->orWhere('driver_name', 'like', $like)));
        }

        // Urutan created_at DESC membuat item dalam tiap group otomatis
        // terurut dari yang terbaru.
        $allItems = $itemsQuery
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        $byKey = [];
        foreach ($allItems as $item) {
            $depoKey = $item->getRawOriginal('kode_depo') ?? '';
            // Normalisasi tanggal sama seperti kandidat — kolom bisa berupa
            // string tergantung driver/cast, jadi optional()->toDateString()
            // yang hanya bekerja pada objek tidak boleh dipakai di sini.
            $key = $item->receiving_id !== null
                ? 'R'.$item->receiving_id
                : 'D'.$toDateString($item->tanggal_penerimaan ?? $item->created_at).'|'.$depoKey;
            $byKey[$key][] = $item;
        }

        $groups = collect($pageCandidates)->map(function ($b) use ($byKey) {
            $groupItems = collect($byKey[$b['key']] ?? []);
            if ($groupItems->isEmpty()) {
                return null;
            }

            $first = $groupItems->first();
            $rk = $first->receiving?->rencanaKirim;

            return [
                'key' => $b['key'],
                'receiving_id' => $b['receiving_id'],
                'po' => $rk?->po_transporter,
                'driver' => $rk?->driver_name,
                'nopol' => $rk?->nopol,
                'depo' => $first->nama_depo ?? $first->kode_depo,
                'sumber' => $groupItems->firstWhere('sumber_material', '!=', null)?->sumber_material ?? $first->sumber_material,
                'tanggal' => $b['tanggal'],
                'created_at' => optional($first->created_at)->toIso8601String(),
                'total_crt' => (float) $groupItems->sum('actual_qty'),
                'total_pcs' => (float) $groupItems->sum(fn ($item) => $item->totalPcs()),
                'items' => $groupItems->values(),
            ];
        })->filter()->values();

        $lastPage = max(1, (int) ceil($total / $perPage));

        return response()->json([
            'data' => $groups,
            'meta' => [
                'total' => $total,
                'per_page' => $perPage,
                'current_page' => $page,
                'last_page' => $lastPage,
                'from' => $total > 0 ? ($page - 1) * $perPage + 1 : null,
                'to' => min($total, $page * $perPage),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'kode_barang' => 'required|string|max:50',
            'nama_barang' => 'nullable|string|max:200',
            'qty_crt' => 'required|numeric|gt:0',
            'qty_pcs' => 'nullable|numeric|min:0',
            'satuan' => 'nullable|string|max:20',
            'expired_date' => 'required|date',
            'tanggal_penerimaan' => 'nullable|date',
            'sumber_material' => 'nullable|string|max:200',
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
        ]);

        $qtyPcs = $validated['qty_pcs'] ?? null;
        $conversionFactor = null;
        $npn = Npn::query()
            ->where('BOSnetszProductId', $validated['kode_barang'])
            ->orWhere('SAPszProductId', $validated['kode_barang'])
            ->first();

        if ($npn && $npn->decUomConversion1) {
            $conversionFactor = (float) $npn->decUomConversion1;
            if ($qtyPcs === null) {
                $qtyPcs = ((float) $validated['qty_crt']) * $conversionFactor;
            }
        }

        $attributes = [
            'source' => ReceivingItem::SOURCE_IMPORT,
            'kode_barang' => $validated['kode_barang'],
            'nama_barang' => $validated['nama_barang'] ?? null,
            'actual_qty' => $validated['qty_crt'],
            'expected_qty' => $validated['qty_crt'],
            'qty_pcs' => $qtyPcs,
            'conversion_factor' => $conversionFactor,
            'satuan' => $validated['satuan'] ?? null,
            'expired_date' => $validated['expired_date'],
            'tanggal_penerimaan' => $validated['tanggal_penerimaan'] ?? today(),
            'sumber_material' => $validated['sumber_material'] ?? null,
            'condition' => ReceivingItem::CONDITIONS[0],
            'scanned_by' => $request->user()->id,
            'scan_time' => now(),
        ];

        $attributes = $request->user()->depotAttributes($attributes);
        $attributes['kode_depo'] ??= $validated['kode_depo'] ?? null;
        $attributes['nama_depo'] ??= $validated['nama_depo'] ?? null;

        $item = ReceivingItem::create($attributes);

        return response()->json([
            'message' => 'Penerimaan manual ditambahkan.',
            'data' => $item->load('receiving.rencanaKirim'),
        ], 201);
    }

    public function update(Request $request, ReceivingItem $receivingItem): JsonResponse
    {
        $validated = $request->validate([
            'qty_crt' => 'sometimes|numeric|min:0',
            'qty_pcs' => 'nullable|numeric|min:0',
            'satuan' => 'nullable|string|max:20',
            'expired_date' => 'sometimes|date',
            'tanggal_penerimaan' => 'nullable|date',
            'condition' => 'nullable|string|max:32',
            'sumber_material' => 'nullable|string|max:200',
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
            'photo' => 'nullable|image|max:10240',
        ]);

        $attributes = array_filter([
            'actual_qty' => $validated['qty_crt'] ?? null,
            'qty_pcs' => $validated['qty_pcs'] ?? null,
            'satuan' => $validated['satuan'] ?? null,
            'expired_date' => $validated['expired_date'] ?? null,
            'tanggal_penerimaan' => $validated['tanggal_penerimaan'] ?? null,
            'condition' => $validated['condition'] ?? null,
            'sumber_material' => $validated['sumber_material'] ?? null,
            'kode_depo' => $validated['kode_depo'] ?? null,
            'nama_depo' => $validated['nama_depo'] ?? null,
            'notes' => $validated['notes'] ?? null,
        ], fn ($value) => $value !== null);

        // Vocab kondisi dinormalisasi ke set kanonik (FISIK_*), lihat ReceivingItem::normalizeCondition.
        if (isset($attributes['condition'])) {
            $attributes['condition'] = ReceivingItem::normalizeCondition($attributes['condition']);
        }

        if ($request->input('condition') === 'FISIK_RUSAK' && empty($receivingItem->photo) && ! $request->hasFile('photo')) {
            throw ValidationException::withMessages([
                'photo' => ['Foto wajib disertakan untuk kondisi barang ini.'],
            ]);
        }

        if ($request->hasFile('photo')) {
            if ($receivingItem->photo) {
                Storage::disk('public')->delete($receivingItem->photo);
            }
            $attributes['photo'] = $request->file('photo')->store('validation-photos', 'public');
        }

        if (array_key_exists('actual_qty', $attributes)) {
            $attributes['expected_qty'] = $attributes['actual_qty'];
            $attributes['selisih_qty'] = 0;

            // Qty PCS adalah nilai turunan dari faktor konversi (master NPN),
            // bukan entri bebas — hitung ulang bila tidak dikirim eksplisit.
            if (! array_key_exists('qty_pcs', $attributes) && $receivingItem->conversion_factor !== null) {
                $attributes['qty_pcs'] = ((float) $attributes['actual_qty']) * (float) $receivingItem->conversion_factor;
            }
        }

        $receivingItem->update($attributes);

        return response()->json([
            'message' => 'Penerimaan diperbarui.',
            'data' => $receivingItem->fresh()->load('receiving.rencanaKirim'),
        ]);
    }

    public function import(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls,csv|max:10240',
        ]);

        try {
            $import = new ReceivingItemImport($request->user());
            Excel::import($import, $request->file('file'));

            return response()->json([
                'message' => 'Import penerimaan manual selesai.',
                'imported' => $import->imported,
                'skipped' => $import->skipped,
                'duplicates' => $import->duplicates,
                'weeks' => $import->weeks,
            ]);
        } catch (ExcelValidationException $e) {
            $failures = $e->failures();
            Log::error('Receiving Import Validation Error', ['failures' => $failures]);

            return response()->json([
                'message' => 'Import gagal karena baris tidak valid.',
                'skipped' => count($failures),
                'errors' => collect($failures)->map(fn ($f) => [
                    'row' => $f->row(),
                    'attribute' => $f->attribute(),
                    'errors' => $f->errors(),
                ])->toArray(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('Receiving Import Error', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);

            return response()->json([
                'message' => 'Import gagal. Silakan periksa file dan coba lagi.',
            ], 500);
        }
    }

    public function template()
    {
        return Excel::download(new ReceivingItemTemplate, 'template_penerimaan_manual.xlsx');
    }

    public function destroy(Request $request, ReceivingItem $receivingItem): JsonResponse
    {
        abort_unless(
            $receivingItem->source === ReceivingItem::SOURCE_IMPORT,
            422,
            'Data hasil validasi SJ tidak dapat dihapus dari sini.'
        );

        $receivingItem->delete();

        return response()->json(['message' => 'Penerimaan manual dihapus.']);
    }

    /**
     * Hapus massal batch manual: by ids terpilih atau seluruhnya (`all`).
     * Query selalu dikunci `source=IMPORT_MANUAL` sehingga data SJ tidak
     * mungkin ikut terhapus walau id-nya dikirim; user depot-scoped hanya
     * menyentuh depo-nya sendiri.
     */
    public function bulkDestroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => 'sometimes|array|max:1000',
            'ids.*' => 'integer',
            'all' => 'sometimes|boolean',
        ]);

        if (empty($validated['all'])) {
            $request->validate(['ids' => 'required|array|min:1|max:1000']);
        }

        $query = ReceivingItem::where('source', ReceivingItem::SOURCE_IMPORT);

        if (empty($validated['all'])) {
            $query->whereIn('id', $validated['ids']);
        }

        if ($request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->user()->kode_depo);
        }

        $deleted = $query->delete();

        return response()->json([
            'message' => "Hapus massal selesai: {$deleted} baris dihapus.",
            'deleted' => $deleted,
        ]);
    }

    public function searchProduct(Request $request): JsonResponse
    {
        $request->validate([
            'q' => 'required|string|min:2',
        ]);

        $like = "%{$request->q}%";

        $npnResults = Npn::select(
            'id',
            'BOSnetszProductId',
            'SAPszProductId',
            'SAPszUomId',
            'szNickName',
            'szNickNameNew',
            'szShortDescription',
        )
            ->where('szNickName', 'like', $like)
            ->orWhere('szNickNameNew', 'like', $like)
            ->orWhere('szShortDescription', 'like', $like)
            ->orWhere('SAPszProductId', 'like', $like)
            ->distinct()
            ->limit(20)
            ->get();

        return response()->json(['data' => $npnResults]);
    }
}
