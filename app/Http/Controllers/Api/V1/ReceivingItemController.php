<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\ReceivingItemBaselineTemplate;
use App\Exports\ReceivingItemTemplate;
use App\Http\Controllers\Controller;
use App\Imports\ReceivingItemImport;
use App\Models\Batch;
use App\Models\Npn;
use App\Models\OpnameExpiredBaselineImport;
use App\Models\OpnameExpiredSession;
use App\Models\OpnameExpiredSessionItem;
use App\Models\ReceivingItem;
use App\Services\OpnameExpiredService;
use App\Support\EvidenceStorage;
use App\Support\LikePattern;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;
use Maatwebsite\Excel\Validators\ValidationException as ExcelValidationException;

class ReceivingItemController extends Controller
{
    /**
     * Batas baris yang dipindai untuk menghitung kandidat group pada
     * `groups()`. Mencegah pemuatan seluruh ledger ke memori pada tabel besar.
     */
    private const GROUPS_SCAN_LIMIT = 50000;

    public function index(Request $request): JsonResponse
    {
        $query = ReceivingItem::with(['receiving.rencanaKirim', 'batch', 'verifiedBatch'])
            ->orderByDesc('created_at');

        if ($request->user()->isDepotScoped()) {
            $query->where(fn ($q) => $q
                ->whereIn('kode_depo', $request->user()->depot_codes)
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r->forUserDepot($request->user())));
        }

        if ($request->source) {
            $query->where('source', $request->source);
        }

        if ($request->search) {
            $like = LikePattern::contains($request->search);
            $query->where(fn ($q) => $q
                ->whereRaw('kode_barang LIKE ? ESCAPE ?', [$like, '\\'])
                ->orWhereRaw('nama_barang LIKE ? ESCAPE ?', [$like, '\\'])
                ->orWhereRaw('sumber_material LIKE ? ESCAPE ?', [$like, '\\'])
                // Kolom di induk: placeholder UI menjanjikan pencarian PO & driver.
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r
                    ->whereRaw('po_transporter LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('driver_name LIKE ? ESCAPE ?', [$like, '\\'])));
        }

        if ($request->kode_depo && ! $request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->kode_depo);
        }

        $perPage = $this->perPage($request);
        $items = $query->paginate($perPage);

        // Status cakupan baseline dihitung sekali per request agar UI bisa
        // membedakan baris yang otomatis tercakup (tanggal) vs ditandai
        // manual. Tanpa ini, pengguna hanya melihat data mentah dan rawan
        // mengira stok baru ikut terhitung.
        $service = app(OpnameExpiredService::class);
        $items->getCollection()->transform(fn (ReceivingItem $item): ReceivingItem => $this->withBaselineCoverage($item, $service));

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
                ->whereIn('kode_depo', $request->user()->depot_codes)
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r->forUserDepot($request->user())));
        }

        if ($request->search) {
            $like = LikePattern::contains($request->search);
            $base->where(fn ($q) => $q
                ->whereRaw('kode_barang LIKE ? ESCAPE ?', [$like, '\\'])
                ->orWhereRaw('nama_barang LIKE ? ESCAPE ?', [$like, '\\'])
                ->orWhereRaw('sumber_material LIKE ? ESCAPE ?', [$like, '\\'])
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r
                    ->whereRaw('po_transporter LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('driver_name LIKE ? ESCAPE ?', [$like, '\\'])));
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

        // Kandidat group dihitung di PHP dari baris yang dipindai. Batasi
        // pemindaian agar tabel besar tidak memuat seluruh ledger ke memori
        // (dulu `->get()` tanpa batas). 50k baris ringan sudah jauh melebihi
        // kebutuhan halaman operasional; bila tercapai, group terdalam tak
        // lagi tercantum — trade-off sadar demi mencegah OOM.
        $rows = (clone $base)
            ->select('id', 'receiving_id', 'kode_depo', 'tanggal_penerimaan', 'created_at')
            ->orderByDesc('created_at')
            ->limit(self::GROUPS_SCAN_LIMIT)
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
        // `batch`/`verifiedBatch` di-eager-load supaya halaman Inbound bisa
        // mencetak label ulang (SJ maupun sesi). Batch label lahir di tahap
        // validasi SJ atau verifikasi sesi, tapi dicetak ulang justru paling
        // sering dibutuhkan saat barang masuk — label harus ditempel di rak.
        $itemsQuery = ReceivingItem::query()->with(['receiving.rencanaKirim', 'batch', 'verifiedBatch'])
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
                ->whereIn('kode_depo', $request->user()->depot_codes)
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r->forUserDepot($request->user())));
        }
        if ($request->search) {
            $like = LikePattern::contains($request->search);
            $itemsQuery->where(fn ($q) => $q
                ->whereRaw('kode_barang LIKE ? ESCAPE ?', [$like, '\\'])
                ->orWhereRaw('nama_barang LIKE ? ESCAPE ?', [$like, '\\'])
                ->orWhereRaw('sumber_material LIKE ? ESCAPE ?', [$like, '\\'])
                ->orWhereHas('receiving.rencanaKirim', fn ($r) => $r
                    ->whereRaw('po_transporter LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('driver_name LIKE ? ESCAPE ?', [$like, '\\'])));
        }

        // Urutan created_at DESC membuat item dalam tiap group otomatis
        // terurut dari yang terbaru.
        $allItems = $itemsQuery
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get();

        $service = app(OpnameExpiredService::class);
        $allItems->each(fn (ReceivingItem $item): ReceivingItem => $this->withBaselineCoverage($item, $service));

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

        $this->assertNoOpenOpnameSession($attributes['kode_depo'] ?? null);

        $item = ReceivingItem::create($attributes);

        // Aturan baku: tiap baris ledger wajib tepat satu batch.
        Batch::issueForReceivingItem($item);

        return response()->json([
            'message' => 'Penerimaan manual ditambahkan.',
            'data' => $item->load('receiving.rencanaKirim'),
        ], 201);
    }

    public function update(Request $request, ReceivingItem $receivingItem): JsonResponse
    {
        abort_unless(
            $request->user()->canAccessDepotRow($receivingItem->kode_depo, $receivingItem->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );

        $validated = $request->validate([
            'qty_crt' => 'sometimes|numeric|min:0',
            'qty_pcs' => 'nullable|numeric|min:0',
            'satuan' => 'nullable|string|max:20',
            'expired_date' => 'sometimes|date',
            'tanggal_penerimaan' => 'nullable|date',
            'condition' => 'nullable|string|max:32',
            // Klasifikasi sumber ledger (SJ vs import manual) bisa ditetapkan
            // ulang lewat update — mis. data baseline hasil input manual yang
            // kemudian divalidasi SJ, agar kembali ke bucket yang benar.
            'source' => 'sometimes|in:VALIDASI_SJ,IMPORT_MANUAL,LEGACY_IMPORT',
            'sumber_material' => 'nullable|string|max:200',
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
            'photo' => 'nullable|image|max:10240',
            // Koreksi cakupan baseline: baris tetap di ledger, tetapi tidak
            // dihitung lagi sebagai stok baru oleh Generate.
            'baseline_covered' => 'sometimes|boolean',
            'baseline_cover_note' => 'nullable|string|max:1000',
        ]);

        $attributes = array_filter([
            'actual_qty' => $validated['qty_crt'] ?? null,
            'qty_pcs' => $validated['qty_pcs'] ?? null,
            'satuan' => $validated['satuan'] ?? null,
            'expired_date' => $validated['expired_date'] ?? null,
            'tanggal_penerimaan' => $validated['tanggal_penerimaan'] ?? null,
            'condition' => $validated['condition'] ?? null,
            'source' => $validated['source'] ?? null,
            'sumber_material' => $validated['sumber_material'] ?? null,
            'kode_depo' => $validated['kode_depo'] ?? null,
            'nama_depo' => $validated['nama_depo'] ?? null,
            'notes' => $validated['notes'] ?? null,
        ], fn ($value) => $value !== null);

        // Koreksi cakupan baseline. Dipisahkan dari field stok karena tidak
        // mengubah saldo ledger — hanya menentukan apakah baris dihitung ulang
        // oleh Generate. Sesi opname yang sedang berjalan tetap diblokir agar
        // snapshot dan hasil koreksi tidak saling bertentangan.
        $coverageRequested = $request->exists('baseline_covered');
        $wasCovered = $receivingItem->baseline_covered_at !== null;
        $desiredCovered = $coverageRequested && $request->boolean('baseline_covered');
        $service = app(OpnameExpiredService::class);

        if ($coverageRequested) {
            if ($service->isBaselineRow($receivingItem)) {
                throw ValidationException::withMessages([
                    'baseline_covered' => ['Baris ini adalah stok awal baseline; cakupannya tidak bisa diubah dari sini.'],
                ]);
            }

            if ($service->hasOpenSessionForDepot($receivingItem->kode_depo)) {
                throw ValidationException::withMessages([
                    'baseline_covered' => ['Sesi opname depo ini masih terbuka. Selesaikan atau batalkan sesi sebelum mengubah cakupan baseline.'],
                ]);
            }

            if ($desiredCovered && ! $wasCovered) {
                $manifest = OpnameExpiredBaselineImport::query()
                    ->where('kode_depo', $receivingItem->kode_depo)
                    ->latest('imported_at')
                    ->first();

                if ($manifest === null) {
                    throw ValidationException::withMessages([
                        'baseline_covered' => ['Belum ada baseline untuk depo ini. Impor baseline terlebih dahulu.'],
                    ]);
                }

                $attributes['baseline_import_id'] = $manifest->id;
                $attributes['baseline_covered_at'] = now();
                $attributes['baseline_covered_by'] = $request->user()->id;
                $attributes['baseline_cover_note'] = $validated['baseline_cover_note'] ?? 'Ditandai sudah tercakup baseline.';
            } elseif ($desiredCovered && array_key_exists('baseline_cover_note', $validated)) {
                // Sudah tercakup: jangan reset waktu/petugas penanda hanya
                // karena baris diedit. Hanya catatan yang boleh diperbarui.
                $attributes['baseline_cover_note'] = $validated['baseline_cover_note'];
            } elseif (! $desiredCovered && $wasCovered) {
                // Jangan hapus baris: cukup lepas penanda agar Generate
                // menghitungnya lagi sebagai stok baru.
                $attributes['baseline_import_id'] = null;
                $attributes['baseline_covered_at'] = null;
                $attributes['baseline_covered_by'] = null;
                $attributes['baseline_cover_note'] = null;
            }
        }

        $coverageChanged = $coverageRequested && $desiredCovered !== $wasCovered;

        // Perubahan tanggal penerimaan bisa menggeser status cakupan baseline
        // (otomatis dari tanggal). Sinkronkan wave saat tanggal berubah agar
        // pengguna tidak perlu menebak apakah perlu Generate manual.
        $oldTanggal = $receivingItem->getRawOriginal('tanggal_penerimaan');
        $newTanggal = $attributes['tanggal_penerimaan'] ?? $oldTanggal;
        $tanggalChanged = $request->exists('tanggal_penerimaan')
            && substr((string) $oldTanggal, 0, 10) !== substr((string) $newTanggal, 0, 10);
        $shouldSync = $coverageChanged || $tanggalChanged;

        // Perubahan yang menggeser saldo/identitas stok harus diblokir selama
        // sesi opname depo masih terbuka; koreksi catatan/foto tetap boleh.
        // Cakupan baseline sudah punya pesan khusus di atas agar pengguna tidak
        // bingung ketika yang dikoreksi bukan saldo.
        $stockFields = ['qty_crt', 'qty_pcs', 'expired_date', 'tanggal_penerimaan', 'source', 'kode_depo'];
        if (collect($stockFields)->contains(fn (string $field) => $request->exists($field))) {
            $this->assertNoOpenOpnameSession($receivingItem->kode_depo);
        }

        // Vocab kondisi dinormalisasi ke set kanonik (FISIK_*), lihat ReceivingItem::normalizeCondition.
        if (isset($attributes['condition'])) {
            $attributes['condition'] = ReceivingItem::normalizeCondition($attributes['condition']);
        }

        if (isset($attributes['source'])) {
            // Baseline hanya lahir dari Import Baseline (punya manifes/cutoff).
            // Membuat legacy lewat update akan menggeser cutoff depo tanpa
            // jejak manifes dan bisa menyembunyikan stok.
            if ($receivingItem->source !== ReceivingItem::SOURCE_LEGACY
                && $attributes['source'] === ReceivingItem::SOURCE_LEGACY) {
                throw ValidationException::withMessages([
                    'source' => ['Baseline legacy hanya bisa dibuat lewat Import Baseline.'],
                ]);
            }

            // Baris baseline boleh direklasifikasi menjadi SJ (mis. sudah
            // divalidasi), tetapi tidak boleh dilempar ke import manual agar
            // tidak lolos dari proteksi hapus baseline.
            if ($receivingItem->source === ReceivingItem::SOURCE_LEGACY
                && ! in_array($attributes['source'], [ReceivingItem::SOURCE_LEGACY, ReceivingItem::SOURCE_VALIDASI], true)) {
                throw ValidationException::withMessages([
                    'source' => ['Baris baseline legacy hanya boleh direklasifikasi ke VALIDASI_SJ.'],
                ]);
            }
        }

        // User depot-scoped tidak boleh memindahkan baris ke depo lain lewat
        // update: pertahankan depo baris (sudah lolos otorisasi), termasuk
        // untuk user region yang boleh mengelola beberapa depot.
        if ($request->user()->isDepotScoped()) {
            $attributes['kode_depo'] = $receivingItem->kode_depo;
            $attributes['nama_depo'] = $receivingItem->nama_depo;
        }

        if (in_array($attributes['condition'] ?? $request->input('condition'), ReceivingItem::CONDITIONS_REQUIRING_PHOTO, true) && empty($receivingItem->photo) && ! $request->hasFile('photo')) {
            throw ValidationException::withMessages([
                'photo' => ['Foto wajib disertakan untuk kondisi barang ini.'],
            ]);
        }

        if ($request->hasFile('photo')) {
            if ($receivingItem->photo) {
                EvidenceStorage::delete($receivingItem->photo);
            }
            $attributes['photo'] = EvidenceStorage::putFile($request->file('photo'), 'validation-photos');
        }

        if (array_key_exists('actual_qty', $attributes)) {
            // Jejak selisih SJ dipertahankan: expected tidak disentuh,
            // selisih dihitung ulang (bukan dinolkan).
            $attributes['selisih_qty'] = ((float) $attributes['actual_qty']) - (float) $receivingItem->expected_qty;

            // Qty PCS adalah nilai turunan dari faktor konversi (master NPN),
            // bukan entri bebas — hitung ulang bila tidak dikirim eksplisit.
            if (! array_key_exists('qty_pcs', $attributes) && $receivingItem->conversion_factor !== null) {
                $attributes['qty_pcs'] = ((float) $attributes['actual_qty']) * (float) $receivingItem->conversion_factor;
            }
        }

        $receivingItem->update($attributes);

        $fresh = $receivingItem->fresh();

        $synced = false;
        if ($shouldSync) {
            // Koreksi cakupan/tanggal harus langsung terlihat di wave, tanpa
            // meminta pengguna menekan Generate manual dan lupa. Dibungkus
            // try/catch: kegagalan generate tidak boleh membatalkan koreksi.
            try {
                $service->generate(null, $request->user());
                $synced = true;
            } catch (\Throwable $e) {
                Log::error('Opname generate after receiving item correction failed', [
                    'receiving_item_id' => $receivingItem->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $coverage = $service->baselineCoverageReason($fresh);
        $isBaselineRow = $service->isBaselineRow($fresh);

        $message = 'Penerimaan diperbarui.';
        if ($coverageChanged) {
            if ($desiredCovered) {
                $message = 'Baris ditandai sudah tercakup baseline dan tidak dihitung sebagai stok baru.';
            } elseif ($coverage === 'date') {
                $message = 'Penanda manual dilepas, tetapi baris tetap tidak dihitung karena tanggal penerimaan masih s.d. tanggal posisi baseline.';
            } else {
                $message = 'Penanda dilepas. Baris kembali dihitung sebagai stok baru.';
            }

            $message .= $synced ? ' Opname sudah disinkronkan.' : ' Generate opname gagal; jalankan Generate manual.';
        } elseif ($tanggalChanged) {
            if ($isBaselineRow) {
                $message = 'Tanggal penerimaan diperbarui. Baris ini tetap stok awal baseline.';
            } else {
                $message = $coverage === 'date'
                    ? 'Tanggal penerimaan diperbarui. Baris sekarang tercakup baseline dan tidak dihitung sebagai stok baru.'
                    : 'Tanggal penerimaan diperbarui. Baris dihitung sebagai stok baru.';
            }

            $message .= $synced ? ' Opname sudah disinkronkan.' : ' Generate opname gagal; jalankan Generate manual.';
        }

        return response()->json([
            'message' => $message,
            'opname_synced' => $synced,
            'baseline_coverage' => $coverage,
            'data' => $fresh->load('receiving.rencanaKirim'),
        ]);
    }

    public function import(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls,csv|max:10240',
        ]);

        $this->assertNoOpenOpnameSession($request->user()->kode_depo);

        try {
            $import = new ReceivingItemImport($request->user());
            DB::transaction(fn () => Excel::import($import, $request->file('file')));

            // Stok manual yang baru masuk langsung disinkronkan ke wave minggu
            // berjalan. Kegagalan generate tidak boleh membatalkan import —
            // respons memberi tahu UI agar menawarkan Generate manual.
            $synced = false;
            if ($import->imported > 0) {
                try {
                    app(OpnameExpiredService::class)->generate(null, $request->user());
                    $synced = true;
                } catch (\Throwable $e) {
                    Log::error('Opname generate after manual stock import failed', [
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            return response()->json([
                'message' => 'Import stok manual selesai.',
                'imported' => $import->imported,
                'skipped' => $import->skipped,
                'duplicates' => $import->duplicates,
                'weeks' => $import->weeks,
                'opname_synced' => $synced,
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
            Log::error('Receiving Import Error', ['error' => $e->getMessage()]);

            return response()->json([
                'message' => 'Import gagal. Silakan periksa file dan coba lagi.',
            ], 500);
        }
    }

    /**
     * Import baseline awal dari Excel legacy — hanya sekali per depo.
     *
     * Baris tetap masuk ke `receiving_items` (ledger tunggal) dengan
     * source LEGACY_IMPORT + baseline_import_id. Manifes import menyimpan
     * cutoff agar Receiving lama yang sudah tercakup tidak dihitung dua kali.
     */
    public function importBaseline(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => 'required|file|mimes:xlsx,xls,csv|max:10240',
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            // Tanggal posisi baseline (inklusif). Bukan tanggal input: file
            // baseline bisa berisi saldo per akhir hari tertentu yang baru
            // diimpor belakangan.
            'baseline_date' => 'nullable|date|before_or_equal:today',
        ]);

        $user = $request->user();
        $kodeDepo = $user->kode_depo ?: ($validated['kode_depo'] ?? null);

        abort_if(blank($kodeDepo), 422, 'Kode depo wajib diisi untuk import baseline.');
        abort_unless(
            $user->canAccessDepotRow($kodeDepo),
            403,
            'Anda tidak memiliki akses ke depo ini.'
        );

        $this->assertNoOpenOpnameSession($kodeDepo);

        $alreadyImported = OpnameExpiredBaselineImport::query()
            ->where('kode_depo', $kodeDepo)
            ->exists();

        abort_if(
            $alreadyImported,
            422,
            'Baseline untuk depo ini sudah pernah diimpor. Baseline hanya boleh satu kali; gunakan koreksi opname untuk penyesuaian.'
        );

        $file = $request->file('file');
        $checksum = hash_file('sha256', $file->getRealPath()) ?: null;

        $baseline = OpnameExpiredBaselineImport::create([
            'kode_depo' => $kodeDepo,
            'file_name' => $file->getClientOriginalName(),
            'file_checksum' => $checksum,
            'imported_by' => $user->id,
            'imported_at' => now(),
            'baseline_date' => $validated['baseline_date'] ?? today()->toDateString(),
            'nama_depo' => $validated['nama_depo'] ?? null,
        ]);

        try {
            $import = new ReceivingItemImport(
                $user,
                ReceivingItem::SOURCE_LEGACY,
                $baseline,
                $kodeDepo,
                $validated['nama_depo'] ?? null,
            );

            DB::transaction(fn () => Excel::import($import, $file));

            // Jangan kunci baseline sekali-seumur-hidup kalau file tidak
            // menghasilkan satu baris pun. Duplikat tetap diterima karena
            // berarti baris legacy sudah ada dan manifes ini mengadopsinya.
            if ($import->imported === 0 && $import->duplicates === 0) {
                $baseline->delete();

                return response()->json([
                    'message' => 'Tidak ada baris baseline yang valid. Periksa kolom wajib (produk, qty, expired) dan format tanggal dd/mm/yyyy.',
                    'skipped' => $import->skipped,
                ], 422);
            }

            $baseline->update([
                'row_count' => $import->imported,
                'total_qty_crt' => ReceivingItem::where('baseline_import_id', $baseline->id)->sum('actual_qty'),
                'total_qty_pcs' => ReceivingItem::where('baseline_import_id', $baseline->id)->sum('qty_pcs'),
            ]);

            // Baseline baru langsung masuk analisa tanpa menunggu Generate
            // manual. Aman: generate idempotent per kunci wave dan dibatasi
            // ke depo yang boleh diakses user.
            $synced = false;
            try {
                app(OpnameExpiredService::class)->generate(null, $user);
                $synced = true;
            } catch (\Throwable $e) {
                Log::error('Opname generate after baseline failed', [
                    'baseline_import_id' => $baseline->id,
                    'error' => $e->getMessage(),
                ]);
            }

            return response()->json([
                'message' => 'Import baseline legacy selesai.',
                'imported' => $import->imported,
                'skipped' => $import->skipped,
                'duplicates' => $import->duplicates,
                'baseline_import_id' => $baseline->id,
                'baseline_date' => $baseline->baseline_date?->toDateString(),
                'opname_synced' => $synced,
            ]);
        } catch (ExcelValidationException $e) {
            $baseline->delete();

            return response()->json([
                'message' => 'Import baseline gagal karena baris tidak valid.',
                'skipped' => count($e->failures()),
                'errors' => collect($e->failures())->map(fn ($f) => [
                    'row' => $f->row(),
                    'attribute' => $f->attribute(),
                    'errors' => $f->errors(),
                ])->toArray(),
            ], 422);
        } catch (\Exception $e) {
            $baseline->delete();
            Log::error('Baseline Import Error', ['error' => $e->getMessage()]);

            return response()->json([
                'message' => 'Import baseline gagal. Silakan periksa file dan coba lagi.',
            ], 500);
        }
    }

    /**
     * Daftar manifes baseline yang bisa diakses user. Dipakai UI untuk
     * menampilkan posisi baseline terpasang dan mengoreksi tanggalnya.
     */
    public function baselineManifests(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = OpnameExpiredBaselineImport::query()
            ->with('importer:id,full_name')
            ->withCount('items')
            ->orderByDesc('imported_at');

        if ($user->isDepotScoped()) {
            $query->whereIn('kode_depo', $user->depot_codes);
        } elseif ($request->filled('kode_depo')) {
            $query->where('kode_depo', (string) $request->string('kode_depo'));
        }

        $service = app(OpnameExpiredService::class);
        $manifests = $query->get();
        $finalizedDepots = OpnameExpiredSession::query()
            ->whereIn('kode_depo', $manifests->pluck('kode_depo')->filter()->unique()->values()->all())
            ->where('week_start', today()->startOfWeek()->toDateString())
            ->whereIn('status', [OpnameExpiredSession::STATUS_APPROVED, OpnameExpiredSession::STATUS_COMPLETED])
            ->pluck('kode_depo')
            ->flip();

        return response()->json([
            'data' => $manifests->map(fn (OpnameExpiredBaselineImport $baseline): array => [
                'id' => $baseline->id,
                'kode_depo' => $baseline->kode_depo,
                'nama_depo' => $baseline->nama_depo,
                'baseline_date' => $baseline->baseline_date?->toDateString(),
                'imported_at' => $baseline->imported_at?->toIso8601String(),
                'file_name' => $baseline->file_name,
                'row_count' => (int) $baseline->row_count,
                'items_count' => (int) $baseline->items_count,
                'total_qty_crt' => (float) $baseline->total_qty_crt,
                'total_qty_pcs' => (float) $baseline->total_qty_pcs,
                'notes' => $baseline->notes,
                'imported_by' => $baseline->importer?->full_name,
                'has_open_session' => $service->hasOpenSessionForDepot($baseline->kode_depo),
                'has_finalized_current_week' => isset($finalizedDepots[$baseline->kode_depo]),
            ]),
        ]);
    }

    /**
     * Koreksi tanggal posisi baseline pada manifes yang sudah ada.
     *
     * Baseline tetap satu kali per depo — yang dikoreksi hanya cutoff
     * tanggalnya. Baris ledger tidak dihapus/diubah; cakupan otomatis
     * dihitung ulang dari `baseline_date` baru, lalu Generate dijalankan agar
     * wave minggu berjalan langsung mencerminkan posisi yang benar.
     */
    public function updateBaseline(Request $request, OpnameExpiredBaselineImport $baselineImport): JsonResponse
    {
        abort_unless(
            $request->user()->canAccessDepotRow($baselineImport->kode_depo, $baselineImport->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );

        $validated = $request->validate([
            'baseline_date' => 'required|date|before_or_equal:today',
            'notes' => 'nullable|string|max:1000',
        ]);

        $service = app(OpnameExpiredService::class);
        $this->assertBaselineCorrectionAllowed((string) $baselineImport->kode_depo, $service);

        $oldDate = $baselineImport->baseline_date?->toDateString();
        $newDate = (string) $validated['baseline_date'];
        $dateChanged = $oldDate !== $newDate;
        $notes = array_key_exists('notes', $validated)
            ? $validated['notes']
            : $baselineImport->notes;

        if ($dateChanged) {
            // Jejak audit koreksi ikut disimpan di manifes (bukan menimpa
            // catatan lama) supaya perubahan cutoff tidak terlihat seperti
            // tanggal asli saat import.
            $audit = sprintf(
                'Koreksi baseline %s -> %s oleh %s pada %s.',
                $oldDate ?? '-',
                $newDate,
                $request->user()->full_name,
                now()->toDateTimeString(),
            );
            $notes = trim(($notes ? $notes."\n" : '').$audit);
        }

        $baselineImport->update([
            'baseline_date' => $newDate,
            'notes' => $notes,
        ]);

        $synced = false;
        if ($dateChanged) {
            try {
                // Service baru: cache cutoff lama tidak boleh dipakai untuk
                // generate setelah tanggal baseline berubah.
                app(OpnameExpiredService::class)->generate(null, $request->user());
                $synced = true;
            } catch (\Throwable $e) {
                Log::error('Opname generate after baseline date correction failed', [
                    'baseline_import_id' => $baselineImport->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $fresh = $baselineImport->fresh();
        $message = $dateChanged
            ? sprintf(
                'Tanggal posisi baseline diperbarui dari %s ke %s.',
                $oldDate ? Carbon::parse($oldDate)->format('d/m/Y') : '-',
                Carbon::parse($newDate)->format('d/m/Y'),
            )
            : 'Catatan baseline diperbarui.';

        return response()->json([
            'message' => $message,
            'opname_synced' => $synced,
            'data' => [
                'id' => $fresh->id,
                'kode_depo' => $fresh->kode_depo,
                'nama_depo' => $fresh->nama_depo,
                'baseline_date' => $fresh->baseline_date?->toDateString(),
                'notes' => $fresh->notes,
            ],
        ]);
    }

    /**
     * Koreksi cutoff baseline mengubah stok yang dihitung. Saat sesi depo
     * masih terbuka, snapshot lapangan bisa bertentangan dengan hasil
     * koreksi; saat sesi minggu ini sudah final, posisinya tidak boleh
     * diubah lagi. Sesi yang dibatalkan tidak menghalangi koreksi/restart.
     */
    private function assertBaselineCorrectionAllowed(string $kodeDepo, OpnameExpiredService $service): void
    {
        if ($service->hasOpenSessionForDepot($kodeDepo)) {
            throw ValidationException::withMessages([
                'baseline_date' => ['Sesi opname depo ini masih terbuka. Selesaikan atau batalkan sesi sebelum mengoreksi baseline.'],
            ]);
        }

        $finalizedThisWeek = $this->hasFinalizedCurrentWeekSession($kodeDepo);

        if ($finalizedThisWeek) {
            throw ValidationException::withMessages([
                'baseline_date' => ['Sesi opname minggu ini sudah final. Koreksi baseline tidak bisa mengubah posisi yang sudah disetujui.'],
            ]);
        }
    }

    private function hasFinalizedCurrentWeekSession(string $kodeDepo): bool
    {
        return OpnameExpiredSession::query()
            ->where('kode_depo', $kodeDepo)
            ->where('week_start', today()->startOfWeek()->toDateString())
            ->whereIn('status', [OpnameExpiredSession::STATUS_APPROVED, OpnameExpiredSession::STATUS_COMPLETED])
            ->exists();
    }

    private function assertNoOpenOpnameSession(?string $kodeDepo): void
    {
        if (app(OpnameExpiredService::class)->hasOpenSessionForDepot($kodeDepo)) {
            abort(422, 'Tidak bisa menambah stok: sesi opname depo ini masih berjalan. Selesaikan sesi terlebih dahulu.');
        }
    }

    public function template()
    {
        return Excel::download(new ReceivingItemTemplate, 'template_penerimaan_manual.xlsx');
    }

    /**
     * Template acuan Import Saldo Awal. Kolom sama dengan stok manual karena
     * keduanya memakai ReceivingItemImport; nama file dibedakan agar operator
     * tidak tertukar antara saldo pembuka dan stok tambahan.
     */
    public function baselineTemplate()
    {
        return Excel::download(new ReceivingItemBaselineTemplate, 'template_saldo_awal.xlsx');
    }

    public function destroy(Request $request, ReceivingItem $receivingItem): JsonResponse
    {
        abort_unless(
            $request->user()->canAccessDepotRow($receivingItem->kode_depo, $receivingItem->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );

        abort_unless(
            $receivingItem->source === ReceivingItem::SOURCE_IMPORT,
            422,
            'Data hasil validasi SJ tidak dapat dihapus dari sini.'
        );

        $this->assertNoOpenOpnameSession($receivingItem->kode_depo);

        $batch = $receivingItem->batch ?? $receivingItem->verifiedBatch;
        if ($batch && OpnameExpiredSessionItem::where('batch_id', $batch->id)->whereNotNull('verified_at')->exists()) {
            abort(422, 'Baris ini tidak bisa dihapus: labelnya sudah terverifikasi sesi lapangan.');
        }

        DB::transaction(function () use ($receivingItem, $batch): void {
            $batch?->delete();
            $receivingItem->delete();
        });

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
            $request->user()->applyDepotFilter($query, 'kode_depo');
        }

        // Hapus massal mengubah saldo depo: tolak bila salah satu depo target
        // masih punya sesi opname terbuka.
        foreach ((clone $query)->whereNotNull('kode_depo')->distinct()->pluck('kode_depo') as $kodeDepo) {
            $this->assertNoOpenOpnameSession($kodeDepo);
        }

        // Aturan hapus ledger berlabel: label ikut terhapus bersama barisnya
        // (tak ada label yatim), KECUALI batch yang sudah TERVERIFIKASI sesi
        // lapangan — itu bukti kerja, penolakan 422 menyebut jumlahnya.
        // Rujukan item sesi yang belum terverifikasi dinullkan otomatis
        // (FK nullOnDelete); verifikasi susulan menerbitkan label baru.
        $targetIds = $query->pluck('id');
        $protected = OpnameExpiredSessionItem::whereHas('batch', fn ($q) => $q
            ->whereIn('receiving_item_id', $targetIds))
            ->whereNotNull('verified_at')
            ->count();

        abort_if($protected > 0, 422, "{$protected} baris tidak bisa dihapus: labelnya sudah terverifikasi sesi lapangan.");

        $deletedBatches = 0;
        $deleted = DB::transaction(function () use ($targetIds, &$deletedBatches): int {
            $deletedBatches = Batch::whereIn('receiving_item_id', $targetIds)->delete();

            return ReceivingItem::whereIn('id', $targetIds)->delete();
        });

        return response()->json([
            'message' => "Hapus massal selesai: {$deleted} baris + {$deletedBatches} label dihapus.",
            'deleted' => $deleted,
            'batches_deleted' => $deletedBatches,
        ]);
    }

    public function searchProduct(Request $request): JsonResponse
    {
        $request->validate([
            'q' => 'required|string|min:2',
        ]);

        $like = LikePattern::contains($request->q);

        $npnResults = Npn::select(
            'id',
            'BOSnetszProductId',
            'SAPszProductId',
            'SAPszUomId',
            'szNickName',
            'szNickNameNew',
            'szShortDescription',
        )
            ->whereRaw('szNickName LIKE ? ESCAPE ?', [$like, '\\'])
            ->orWhereRaw('szNickNameNew LIKE ? ESCAPE ?', [$like, '\\'])
            ->orWhereRaw('szShortDescription LIKE ? ESCAPE ?', [$like, '\\'])
            ->orWhereRaw('SAPszProductId LIKE ? ESCAPE ?', [$like, '\\'])
            ->distinct()
            ->limit(20)
            ->get();

        return response()->json(['data' => $npnResults]);
    }

    private function withBaselineCoverage(ReceivingItem $item, OpnameExpiredService $service): ReceivingItem
    {
        $reason = $service->baselineCoverageReason($item);
        $item->setAttribute('baseline_coverage', $reason);
        $item->setAttribute('is_baseline_covered', $reason !== null);
        $item->setAttribute('is_baseline_row', $service->isBaselineRow($item));

        // Accessor `tanggal_penerimaan` mengembalikan fallback saat kolom
        // kosong. Frontend perlu tahu apakah tanggal itu benar-benar tersimpan
        // agar membuka modal edit tidak diam-diam menulis tanggal fallback.
        $rawTanggal = $item->getRawOriginal('tanggal_penerimaan');
        $item->setAttribute('has_tanggal_penerimaan', $rawTanggal !== null && $rawTanggal !== '');

        return $item;
    }
}


    /**
     * Reset baseline import untuk depo ini — menghapus manifes baseline lama
     * dan mengosongkan baseline_import_id pada receiving items terkait.
     * Setelah ini, admin/depo bisa impor baseline baru.
     *
     * @param  OpnameExpiredBaselineImport  $baselineImport
     * @return JsonResponse
     */
    public function resetBaseline(OpnameExpiredBaselineImport $baselineImport): JsonResponse
    {
        abort_unless(
            $request->user()->canAccessDepotRow($baselineImport->kode_depo, $baselineImport->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );

        // Update receiving items yang tercatat baseline untuk membuang reference
        $baselineImport->items()->update(['baseline_import_id' => null]);

        // Hapus manifes baseline import
        $baselineImport->delete();

        return response()->json([
            'message' => 'Manifest baseline untuk depo ' . $baselineImport->kode_depo . ' telah dihapus. Anda sekarang bisa impor baseline baru.',
            'deleted_baseline_id' => $baselineImport->id,
            'kode_depo' => $baselineImport->kode_depo,
        ]);
    }
