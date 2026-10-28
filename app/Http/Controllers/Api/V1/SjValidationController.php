<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Mail\ExtraItemDecision;
use App\Mail\ExtraItemReported;
use App\Mail\SelisihQtyNotification;
use App\Mail\SjValidated;
use App\Models\Batch;
use App\Models\Npn;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\SjValidation;
use App\Models\SjValidationExtraItem;
use App\Models\SjValidationItem;
use App\Models\StandarisasiTumpukan;
use App\Models\StandarUmurProduk;
use App\Models\User;
use App\Services\EmailNotificationService;
use App\Support\EvidenceStorage;
use App\Support\LikePattern;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SjValidationController extends Controller
{
    public function __construct(private EmailNotificationService $emailService) {}

    public function index(Request $request): JsonResponse
    {
        $query = SjValidation::with(['rencanaKirim:id,po_transporter,driver_name,nopol,destination_name,kode_depo,nama_depo', 'validator:id,full_name'])
            // History rows only need the counters, not every line. Loading the
            // items relation would make the list heavier and is unnecessary.
            ->withCount([
                'items',
                'items as validated_items_count' => fn ($q) => $q->where('status', '!=', 'PENDING'),
            ])
            ->when($request->user()->isDepotScoped(), fn ($q) => $q->whereHas('rencanaKirim', fn ($s) => $s->forUserDepot($request->user())))
            ->when($request->filled('kode_depo') && ! $request->user()->isDepotScoped(), fn ($q) => $q->whereHas('rencanaKirim', fn ($s) => $s->where('kode_depo', $request->input('kode_depo'))))
            ->when($request->status, fn ($q) => $q->where('status', $request->status))
            ->when($request->date_from, fn ($q) => $q->whereDate('created_at', '>=', $request->date_from))
            ->when($request->date_to, fn ($q) => $q->whereDate('created_at', '<=', $request->date_to))
            ->when($request->search, function ($q) use ($request) {
                $like = LikePattern::contains($request->search);
                $q->where(function ($qq) use ($like) {
                    $qq->whereHas('rencanaKirim', fn ($s) => $s->whereRaw('po_transporter LIKE ? ESCAPE ?', [$like, '\\']));
                });
            })
            ->orderBy('created_at', 'desc');

        $perPage = $this->perPage($request);

        return response()->json($query->paginate($perPage));
    }

    /**
     * Statistik global untuk header halaman Validasi Dokumen (bukan hitungan halaman aktif).
     * Level status validasi hanya IN_PROGRESS / COMPLETED / CANCELLED — "menunggu" tidak ada,
     * karena record validasi langsung dibuat IN_PROGRESS saat dimulai.
     */
    public function stats(Request $request): JsonResponse
    {
        $request->validate(['kode_depo' => 'nullable|string|max:20']);
        $user = $request->user();

        $base = SjValidation::query()
            // User scoped terkunci ke depo sendiri; `kode_depo` asing diabaikan.
            ->when($user->isDepotScoped(), fn ($q) => $q->whereHas('rencanaKirim', fn ($s) => $s->forUserDepot($user)))
            // Master: chip statistik mengikuti filter depo yang dipilih.
            ->when($request->filled('kode_depo') && ! $user->isDepotScoped(), fn ($q) => $q->whereHas('rencanaKirim', fn ($s) => $s->where('kode_depo', $request->input('kode_depo'))));

        $statusCounts = (clone $base)->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return response()->json([
            'data' => [
                'today' => (clone $base)->whereDate('created_at', today())->count(),
                'in_progress' => (int) ($statusCounts['IN_PROGRESS'] ?? 0),
                'completed' => (int) ($statusCounts['COMPLETED'] ?? 0),
                'cancelled' => (int) ($statusCounts['CANCELLED'] ?? 0),
                'total' => array_sum($statusCounts->all()),
            ],
        ]);
    }

    private function authorizeDepot(SjValidation|RencanaKirim $record): void
    {
        $rk = $record instanceof RencanaKirim ? $record : $record->rencanaKirim;
        abort_unless(
            Auth::user() instanceof User
                && $this->currentUser()->canAccessDepotRow($rk?->kode_depo, $rk?->nama_depo),
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
            'extraItems.npn',
            'extraItems.recorder:id,full_name',
            'extraItems.approver:id,full_name',
            'validator:id,full_name',
        ]);
        $this->attachStandarUmur($sjValidation->items);
        $this->attachStandarisasiTumpukan($sjValidation->items);
        // Umur standar juga relevan untuk barang luar rencana (dropdown form
        // di mobile memakai reminder umur yang sama).
        $this->attachStandarUmur($sjValidation->extraItems);

        // Apakah pengguna ini boleh mengoreksi item pada sesi yang sudah selesai.
        // Dihitung di server karena hanya server yang tahu status Receiving, dan
        // UI harus menampilkan aksi yang benar-benar akan berhasil — bukan
        // tombol yang tetap terlihat lalu ditolak 422 saat ditekan.
        $sjValidation->can_correct_completed = $this->itemEditability($sjValidation)[0];

        return response()->json(['data' => $sjValidation]);
    }

    /**
     * Lampirkan umur standar (bulan) pada setiap item validasi, diambil dari
     * tabel standar_umur_produk melalui npn.SAPszProductId -> standar_umur_produk.material.
     *
     * Menerima baris rencana (SjValidationItem) maupun barang luar rencana
     * (SjValidationExtraItem) — keduanya punya relasi `npn` yang sama.
     */
    protected function attachStandarUmur(Collection|iterable $items): void
    {
        $items = collect($items);
        $materials = $items
            ->map(fn ($it) => $it->npn?->SAPszProductId)
            ->filter()
            ->unique()
            ->values();

        $umurs = StandarUmurProduk::whereIn('material', $materials)
            ->pluck('umur', 'material');

        foreach ($items as $item) {
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
     * Record existing ditemukan berdasarkan npn_id — jika sudah ada (terebus atau pending),
     * hanya data tier/tinggi/total diperbarui; status tetap 'pending' hingga admin
     * distributor approve. Hanya jika tidak ada record sama sekali baru dibuat.
     *
     * Mencegah duplikat: jika sudah ada record dengan status 'pending', lempar error
     * agar konsisten dengan proteksi di StandarisasiTumpukanController@store.
     */
    protected function upsertStandarisasiTumpukan(SjValidationItem $item, User $user, array $data): void
    {
        $tier = (int) ($data['tier'] ?? 0);
        $tinggi = (int) ($data['tinggi_tumpukan'] ?? 0);

        if (! $item->npn_id) {
            return;
        }

        // Cek duplikasi: tolak jika sudah ada standarisasi pending untuk npn_id ini.
        // Konsisten dengan proteksi di StandarisasiTumpukanController@store.
        $existingPending = StandarisasiTumpukan::where('npn_id', $item->npn_id)
            ->where('status', 'pending')
            ->first();

        if ($existingPending) {
            throw ValidationException::withMessages([
                'standarisasi' => ['Standarisasi tumpukan already exists for this product. Please update the existing request or wait for approval.'],
            ]);
        }

        $payload = [
            'tier' => $tier,
            'tinggi_tumpukan' => $tinggi,
            'total_tier_tinggi' => $tier > 0 && $tinggi > 0 ? $tier * $tinggi : null,
            'requested_by' => $user->id,
            'requested_by_email' => $user->email,
        ];

        // Cari record standarisasi sudah ada untuk npn_id ini (berdasarkan urutan terbaru).
        // Status yang bukan 'pending' (misal approved/rejected) boleh dibuat ulang.
        $existing = StandarisasiTumpukan::where('npn_id', $item->npn_id)
            ->orderByDesc('id')
            ->first();

        if ($existing) {
            // Update data tier/tinggi/total hanya — status 'pending' tetep hingga admin approve.
            $existing->update(array_merge($payload, ['status' => 'pending']));

            return;
        }

        // Tidak ada record sama sekali → buat baru dengan status pending.
        StandarisasiTumpukan::create(array_merge(
            ['npn_id' => $item->npn_id, 'status' => 'pending'],
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
     * Mulai validasi dari dokumen yang sudah diketahui (hasil scan di Check In).
     *
     * Model tidak di-bind route supaya dokumen yang tidak ada / bukan depo
     * pengguna menjawab 404 "Dokumen tidak ditemukan" — sama dengan
     * `startByCode` — bukan pesan ModelNotFound mentah yang membocorkan nama
     * class ke layar operator.
     */
    public function start(Request $request, int $rencanaKirim): JsonResponse
    {
        $rencanaKirim = RencanaKirim::query()
            ->forUserDepot($request->user())
            ->with('items.npn')
            ->find($rencanaKirim);

        if (! $rencanaKirim) {
            return response()->json(['message' => 'Dokumen tidak ditemukan'], 404);
        }

        return $this->startValidation($request, $rencanaKirim);
    }

    protected function startValidation(Request $request, RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);

        // Validasi SJ hanya boleh dimulai setelah Check In Point (Gate IN).
        // Status yang diizinkan: CHECKED_IN (sudah gate in) atau VERIFIED.
        // SCHEDULED (belum check-in) DIBLOKIR.
        abort_unless(
            in_array($rencanaKirim->status, ['CHECKED_IN', 'VERIFIED'], true),
            422,
            "Validasi tidak dapat dimulai. Rencana harus sudah Check In terlebih dahulu (status saat ini: {$rencanaKirim->status})."
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
     * Hitung durasi (detik) dari `started_at` sampai waktu terminal sekarang.
     *
     * Dipakai `complete()` dan `cancel()` supaya keduanya menghitung dengan
     * aturan yang sama — dua implementasi dari aturan yang sama pasti akan
     * berbeda begitu salah satunya lupa diperbarui.
     *
     * Mengembalikan null bila `started_at` kosong atau jamnya tidak konsisten
     * (selesai sebelum mulai). Nilai negatif lebih buruk daripada null: akan
     * tampil sebagai "−3j" di tabel dan ikut terambil sebagai angka laporan.
     */
    protected function elapsedSeconds(SjValidation $sjValidation, Carbon $endedAt): ?int
    {
        if (! $sjValidation->started_at) {
            return null;
        }

        $seconds = $endedAt->getTimestamp() - $sjValidation->started_at->getTimestamp();

        return $seconds < 0 ? null : $seconds;
    }

    /**
     * Salin ulang nilai item validasi ke baris ReceivingItem-nya.
     *
     * No-op untuk sesi IN_PROGRESS (Receiving-nya belum ada) dan untuk sesi
     * yang Receiving-nya sudah COMPLETED — pada kasus itu `itemEditability()`
     * sudah menolak lebih dulu, jadi method ini tidak akan pernah dipanggil
     * dengan Receiving tertutup.
     *
     * Total di header Receiving ikut dihitung ulang karena `total_received_qty`
     * disimpan sebagai hasil SUM saat materialisasi; kalau tidak dihitung ulang,
     * angka header akan terlihat tidak sinkron dengan detailnya.
     */
    protected function syncReceivingItem(SjValidationItem $item): void
    {
        $receivingItem = ReceivingItem::where('sj_validation_item_id', $item->id)->first();
        if (! $receivingItem) {
            return;
        }

        $selisihQty = (float) $item->actual_qty - (float) $item->expected_qty;

        $receivingItem->update([
            'actual_qty' => $item->actual_qty,
            'condition' => $item->condition ?? 'FISIK_BAGUS',
            'expired_date' => $item->expired_date,
            'barcode' => $item->barcode,
            'notes' => $item->notes,
            'photo' => $item->photo,
            'selisih_qty' => $selisihQty,
            'selisih_reason' => $selisihQty != 0 ? match ($item->condition) {
                'FISIK_RUSAK' => 'Barang rusak',
                'QTY_KURANG' => 'Qty kurang dari rencana',
                'ISI_KEMASAN_KURANG' => 'Isi kemasan kurang',
                'EXPIRED_TIDAK_STANDAR' => 'Expired tidak standar',
                'LAINNYA' => 'Lainnya',
                default => 'Selisih qty',
            } : null,
        ]);

        $receiving = $receivingItem->receiving;
        $receiving?->update([
            'total_received_qty' => $receiving->items()->sum('actual_qty'),
        ]);
    }

    /**
     * Apakah hasil item pada sesi validasi ini masih boleh diubah.
     *
     * Menggantikan gate `abort_unless(status === 'IN_PROGRESS')` yang dulu
     * diulang di dua tempat terpisah (`scanItem` dan `deleteItem`),
     * karena dua implementasi dari aturan yang sama pasti akan berbeda
     * begitu salah satunya lupa diperbarui.
     *
     * Tiga lapis, berurutan dari yang paling umum:
     *
     * 1. `IN_PROGRESS` — bebas ubah. Ini jalur normal operator.
     *
     * 2. `COMPLETED` — hanya untuk pemegang `sj_validation.edit_completed`
     *    DAN Receiving-nya belum COMPLETED. Sesi yang sudah `complete()`
     *    menyalin nilai item ke `receiving_items`, jadi koreksi di sini
     *    harus ikut tersalin; kalau Receiving sudah COMPLETED tidak ada
     *    yang akan menyalin dan angkanya akan selamanya berbeda — Opname
     *    Expired serta laporan Penerimaan membaca `receiving_items`, bukan
     *    `sj_validation_items`.
     *
     * 3. `CANCELLED` — tidak pernah bisa diubah, oleh siapa pun. Sesi
     *    dibatalkan karena tidak dipakai; label batch-nya sudah dicoret dan
     *    tidak berlaku. Menghidupkan kembali dokumen yang sengaja dibuang
     *    hanya mengembalikan kekacauan.
     *
     * Status tak dikenal gagal DEFAULT ke tutup, supaya nilai baru di masa
     * depan tidak diam-diam mendapat akses edit.
     *
     * @return array{0: bool, 1: string|null} [boleh?, pesan penolakan]
     */
    protected function itemEditability(SjValidation $sjValidation): array
    {
        if ($sjValidation->status === 'IN_PROGRESS') {
            return [true, null];
        }

        if ($sjValidation->status === 'COMPLETED') {
            if (! $this->currentUser()->hasPermission('sj_validation.edit_completed')) {
                return [false, 'Validasi sudah selesai sehingga hasil item tidak dapat diubah.'];
            }

            $receiving = Receiving::where('rencana_kirim_id', $sjValidation->rencana_kirim_id)
                ->whereIn('status', ['PENDING', 'IN_PROGRESS'])
                ->first();

            if (! $receiving) {
                return [false, 'Receiving sudah selesai. Koreksi harus dilakukan lewat menu Receiving, bukan Validasi Dokumen.'];
            }

            return [true, null];
        }

        if ($sjValidation->status === 'CANCELLED') {
            return [false, 'Validasi sudah dibatalkan sehingga isinya tidak dapat diubah.'];
        }

        return [false, "Validasi berstatus {$sjValidation->status} tidak dapat diubah."];
    }

    public function scanItem(Request $request, SjValidation $sjValidation): JsonResponse
    {
        $this->authorizeDepot($sjValidation);
        [$editable, $reason] = $this->itemEditability($sjValidation);
        abort_unless($editable, 422, $reason);

        $expiredDate = $request->input('expired_date');
        if (is_string($expiredDate) && preg_match('/^\d{8}$/', trim($expiredDate))) {
            $compactDate = trim($expiredDate);
            $year = (int) substr($compactDate, 0, 4);
            $month = (int) substr($compactDate, 4, 2);
            $day = (int) substr($compactDate, 6, 2);

            if (checkdate($month, $day, $year)) {
                $request->merge([
                    'expired_date' => sprintf('%04d-%02d-%02d', $year, $month, $day),
                ]);
            }
        }

        $validated = $request->validate([
            'sj_validation_item_id' => 'required|exists:sj_validation_items,id',
            'barcode' => 'nullable|string|max:100',
            'actual_qty' => 'required|numeric|min:0|max:999999',
            'expired_date' => 'nullable|date_format:Y-m-d',
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
            throw ValidationException::withMessages([
                'photo' => ['Foto wajib diunggah untuk kondisi ini.'],
            ]);
        }

        // Seluruh tulis scan (item + batch + receiving + standarisasi) dalam
        // satu transaksi dengan kunci baris: double-tap/operator ganda tidak
        // boleh menggandakan batch atau menghilangkan hasil scan.
        return DB::transaction(function () use ($request, $sjValidation, $validated) {
            $item = SjValidationItem::whereKey($validated['sj_validation_item_id'])->lockForUpdate()->firstOrFail();
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
                $photoPath = EvidenceStorage::putFile($request->file('photo'), 'validation-photos');
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
            // Guard anti-ganda: baris item sudah di-lockForUpdate di atas sehingga
            // dua scan bersamaan terserialisasi; tangkapan duplikat di sini
            // menutup celah sisa (retry jaringan / double-tap lolos validasi).
            $existingBatch = Batch::where('sj_validation_item_id', $item->id)->first();
            if (! $existingBatch) {
                try {
                    Batch::createWithRetry([
                        'sj_validation_item_id' => $item->id,
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
                } catch (QueryException $e) {
                    // Baris batch sudah dibuat transaksi pesaing — pakai yang ada.
                    if (! in_array($e->getCode(), ['23000', '23505'], true)
                        && $e->errorInfo[0] !== '23000') {
                        throw $e;
                    }
                }
            }

            $item->load(['npn', 'batch']);
            $this->attachStandarUmur([$item]);
            // Koreksi setelah `complete()` hanya sah kalau baris Receiving ikut
            // diperbarui. `receiving_items` adalah salinan yang dibaca Opname Expired
            // dan laporan Penerimaan; menyalin ulang di sini adalah satu-satunya cara
            // supaya dua tabel tidak berbeda setelah supervisor memperbaiki angka.
            $this->syncReceivingItem($item);

            // Standarisasi tumpukan: jika frontend mengirim tier/tinggi (produk belum
            // punya standarisasi tersimpan), catat agar tidak diminta berulang.
            if (isset($validated['tier']) || isset($validated['tinggi_tumpukan'])) {
                $this->upsertStandarisasiTumpukan($item, $request->user(), $validated);
            }

            $this->standarisasiForItem($item);

            // Batch ikut dikembalikan di respons scan. Label batch ditempel fisik ke
            // produk tepat setelah operator memvalidasi, jadi frontend (web maupun
            // mobile) harus bisa mencetak tanpa fetch kedua — dan satu produk memang
            // satu batch, jadi tidak ada ambiguitas label mana yang dicetak.
            // (batch sudah di-load di atas bersama npn — jangan load ulang.)
            return response()->json([
                'message' => 'Item divalidasi',
                'data' => $item,
            ]);
        });
    }

    /**
     * Catat barang di luar rencana kirim (deviation record).
     *
     * Fase 1: operator mencatat kenyataan fisik — barang yang dibawa
     * transporter tetapi tidak ada di rencana planner — tanpa mengedit
     * rencana. Baris disimpan terpisah dari `sj_validation_items` sehingga
     * seluruh agregat plan-vs-aktual tetap menghitung hanya baris rencana.
     * Foto bukti wajib karena menggantikan catatan manual di kertas.
     */
    public function storeExtraItem(Request $request, SjValidation $sjValidation): JsonResponse
    {
        $this->authorizeDepot($sjValidation);
        abort_unless(
            $sjValidation->status === 'IN_PROGRESS',
            422,
            'Barang luar rencana hanya dapat dicatat saat sesi masih berjalan.'
        );

        $expiredDate = $request->input('expired_date');
        if (is_string($expiredDate) && preg_match('/^\d{8}$/', trim($expiredDate))) {
            $compactDate = trim($expiredDate);
            $year = (int) substr($compactDate, 0, 4);
            $month = (int) substr($compactDate, 4, 2);
            $day = (int) substr($compactDate, 6, 2);

            if (checkdate($month, $day, $year)) {
                $request->merge([
                    'expired_date' => sprintf('%04d-%02d-%02d', $year, $month, $day),
                ]);
            }
        }

        $validated = $request->validate([
            'barcode' => 'nullable|string|max:100',
            'npn_id' => 'nullable|integer|exists:npn,id',
            'kode_barang' => 'required_without_all:barcode,npn_id|nullable|string|max:50',
            'nama_barang' => 'nullable|string|max:200',
            'qty' => 'required|numeric|min:0.01|max:999999',
            'satuan' => 'nullable|string|max:20',
            'condition' => 'nullable|string|in:FISIK_BAGUS,FISIK_RUSAK,QTY_KURANG,ISI_KEMASAN_KURANG,EXPIRED_TIDAK_STANDAR,LAINNYA',
            'expired_date' => 'nullable|date_format:Y-m-d',
            'notes' => 'nullable|string|max:2000',
            'photo' => [
                'required', 'image', 'mimes:jpg,jpeg,png', 'max:5120',
            ],
        ]);

        // Identitas barang dikunci ke master data (NPN) — bukan teks bebas.
        // Prioritas sumber identitas: pilihan pencarian NPN (`npn_id`, pola
        // combobox Rencana Kirim), lalu lookup barcode, lalu manual kode+nama
        // untuk barang yang tidak tercatat di master.
        $npn = null;
        if (! empty($validated['npn_id'])) {
            $npn = Npn::find($validated['npn_id']);
        } elseif (! empty($validated['barcode'])) {
            $barcode = trim($validated['barcode']);
            $npn = Npn::where(function ($q) use ($barcode) {
                $q->where('BOSnetszProductId', $barcode)
                    ->orWhere('SAPszProductId', $barcode)
                    ->orWhere('szBarcode', $barcode)
                    ->orWhere('szBarcodeSekunder', $barcode)
                    ->orWhere('szBarcodeTersier', $barcode);
            })->first();
        }

        $kodeBarang = $npn?->BOSnetszProductId ?? ($validated['kode_barang'] ?? null);
        $namaBarang = $npn?->szNickName ?? ($validated['nama_barang'] ?? null);
        $satuan = $npn?->SAPszUomId ?? ($validated['satuan'] ?? null);
        if ($kodeBarang === null || $namaBarang === null) {
            throw ValidationException::withMessages([
                'kode_barang' => ['Barang tidak dikenal — isi kode dan nama barang dari kertas/manual.'],
            ]);
        }

        $extra = DB::transaction(function () use ($request, $sjValidation, $validated, $npn, $kodeBarang, $namaBarang, $satuan) {
            $photoPath = EvidenceStorage::putFile($request->file('photo'), 'validation-photos');

            return SjValidationExtraItem::create([
                'sj_validation_id' => $sjValidation->id,
                'npn_id' => $npn?->id,
                'barcode' => $validated['barcode'] ?? null,
                'kode_barang' => $kodeBarang,
                'nama_barang' => $namaBarang,
                'qty' => $validated['qty'],
                'satuan' => $satuan,
                'condition' => $validated['condition'] ?? 'FISIK_BAGUS',
                'expired_date' => $validated['expired_date'] ?? null,
                'photo' => $photoPath,
                'notes' => $validated['notes'] ?? null,
                'recorded_by' => $request->user()->id,
            ]);
        });

        // Beri tahu planner/supervisor: barang fisik masuk tanpa rencana.
        // Penerima diatur admin lewat menu Penerima Email (dokumen `sj_ba`,
        // trigger `extra_item`); tanpa konfigurasi, kirim hanya dicatat log.
        $rencanaKirim = $sjValidation->rencanaKirim;
        if ($rencanaKirim) {
            $extra->setRelation('validation', $sjValidation);
            $this->emailService->send(
                'sj_ba',
                'extra_item',
                $rencanaKirim->fresh(),
                new ExtraItemReported($rencanaKirim->fresh(), $sjValidation->fresh(), $extra->fresh()),
                $rencanaKirim->kode_depo
            );
        }

        $extra->load(['npn', 'recorder:id,full_name']);

        return response()->json([
            'message' => 'Barang luar rencana tercatat',
            'data' => $extra,
        ], 201);
    }

    /**
     * Fase 2: keputusan planner atas catatan barang luar rencana.
     *
     * Setujui/tolak adalah jejak keputusan (audit trail) — rencana kirim
     * tetap tidak pernah diubah. Hanya catatan PENDING yang bisa diputuskan;
     * keputusan bersifat final (tanpa unpending) supaya jejaknya lurus.
     * Pemberitahuan hasil lewat email (trigger `extra_item_decision`,
     * dokumen `sj_ba`).
     */
    public function approveExtraItem(Request $request, SjValidation $sjValidation, int $extraItem): JsonResponse
    {
        return $this->decideExtraItem($request, $sjValidation, $extraItem, 'APPROVED');
    }

    public function rejectExtraItem(Request $request, SjValidation $sjValidation, int $extraItem): JsonResponse
    {
        return $this->decideExtraItem($request, $sjValidation, $extraItem, 'REJECTED');
    }

    private function decideExtraItem(Request $request, SjValidation $sjValidation, int $extraItemId, string $decision): JsonResponse
    {
        $this->authorizeDepot($sjValidation);

        $validated = $request->validate([
            'notes' => $decision === 'REJECTED'
                ? 'required|string|max:2000'
                : 'nullable|string|max:2000',
        ]);

        $extra = SjValidationExtraItem::where('sj_validation_id', $sjValidation->id)
            ->find($extraItemId);
        if (! $extra) {
            // 404 bukan 422: catatan itu bukan milik validasi ini — jangan
            // bocorkan keberadaannya lewat pesan status yang salah.
            abort(404, 'Catatan barang luar rencana tidak ditemukan.');
        }
        abort_unless(
            $extra->status === 'PENDING',
            422,
            'Catatan sudah diputuskan (status '.$extra->status.') — keputusan bersifat final.'
        );

        $extra->update([
            'status' => $decision,
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
            'decision_notes' => $validated['notes'] ?? null,
        ]);

        $this->emailService->send(
            'sj_ba',
            'extra_item_decision',
            $extra->fresh(),
            new ExtraItemDecision($extra->fresh(), $decision),
            $sjValidation->rencanaKirim?->kode_depo
        );

        $extra->load(['npn', 'recorder:id,full_name', 'approver:id,full_name']);

        return response()->json([
            'message' => $decision === 'APPROVED'
                ? 'Barang luar rencana disetujui'
                : 'Barang luar rencana ditolak',
            'data' => $extra,
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

        [$completedValidation, $receiving] = DB::transaction(function () use ($sjValidation) {
            // Kunci baris validasi: mencegah dua user menyelesaikan bersamaan
            // dan menciptakan Receiving + ReceivingItems dobel.
            $locked = SjValidation::query()
                ->whereKey($sjValidation->id)
                ->lockForUpdate()
                ->first();

            if ($locked->status !== 'IN_PROGRESS') {
                abort(422, "Validasi berstatus {$locked->status} tidak dapat diselesaikan.");
            }

            $pending = $locked->items()->where('status', 'PENDING')->count();
            abort_if($pending > 0, 422, 'Masih ada item yang belum divalidasi ('.$pending.')');

            // Tanggal expired adalah syarat kelengkapan yang sama di web.
            // Tanpa guard di server, client lain bisa menyelesaikan sesi
            // dengan data bolong dan Receiving/Opname Expired ikut kosong.
            $missingExpired = $locked->items()
                ->where(fn ($q) => $q->whereNull('expired_date')->orWhere('expired_date', ''))
                ->count();
            abort_if(
                $missingExpired > 0,
                422,
                'Lengkapi tanggal expired untuk '.$missingExpired.' item sebelum menyelesaikan validasi.'
            );

            $finishedAt = now();

            $locked->update([
                'status' => 'COMPLETED',
                'completed_at' => $finishedAt,
                'duration_seconds' => $this->elapsedSeconds($locked, $finishedAt),
            ]);

            [$locked, $receiving] = $this->ensureReceiving($locked);

            // Maju satu arah saja di DALAM transaksi yang sama: crash di
            // antara commit receiving dan update RK meninggalkan kombinasi
            // yatim (COMPLETED + PENDING + CHECKED_IN) yang tak bisa
            // dilanjutkan dari UI.
            //
            // SCHEDULED ikut didorong: validasi memang boleh dimulai tanpa
            // gate check-in (startValidation mengizinkan SCHEDULED), jadi
            // complete tanpa gate harus tetap menyerahkan dokumen ke
            // VERIFIED — kalau tidak, rencana tertinggal di SCHEDULED
            // sementara receiving auto sudah lahir, dan SCHEDULED → VERIFIED
            // tidak ada di peta transisi → alur mandeg setelah receiving
            // dibatalkan.
            $rk = $locked->rencanaKirim()->lockForUpdate()->first();
            if ($rk && in_array($rk->status, ['SCHEDULED', 'CHECKED_IN'], true)) {
                $rk->update([
                    'status' => 'VERIFIED',
                    'verified_at' => now(),
                ]);
            }

            return [$locked, $receiving];
        });

        $rencanaKirim = $completedValidation->rencanaKirim;

        $this->emailService->send(
            'sj_ba',
            'validated',
            $rencanaKirim->fresh(),
            new SjValidated($rencanaKirim->fresh(), $sjValidation->fresh('items')),
            $rencanaKirim->kode_depo
        );

        // Kirim notif selisih qty jika ada
        $receivingItems = $receiving->items()->where('selisih_qty', '!=', 0)->get();
        if ($receivingItems->isNotEmpty()) {
            $this->emailService->send(
                'selisih',
                'selisih_qty',
                $rencanaKirim->fresh(),
                new SelisihQtyNotification($rencanaKirim->fresh(), $receivingItems),
                $rencanaKirim->kode_depo
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
        // Gate yang sama persis dengan scanItem — aturan "boleh ubah atau tidak"
        // harus punya satu implementasi, bukan dua yang bisa berbeda.
        [$editable, $reason] = $this->itemEditability($sjValidation);
        abort_unless($editable, 422, $reason);
        $row = SjValidationItem::findOrFail($item);
        if ($row->sj_validation_id !== $sjValidation->id) {
            return response()->json(['message' => 'Item tidak sesuai validasi ini'], 422);
        }

        DB::transaction(function () use ($row): void {
            $locked = SjValidationItem::whereKey($row->id)->lockForUpdate()->firstOrFail();

            // Koreksi pada sesi COMPLETED harus ikut bersih di receiving_items
            // (prinsip yang sama dengan syncReceivingItem): baris yang menunjuk
            // item ini ikut dihapus — bukan dibiarkan putus link oleh FK
            // nullOnDelete sementara total header tidak dihitung ulang.
            $linkedReceivingItem = ReceivingItem::where('sj_validation_item_id', $locked->id)->first();
            if ($linkedReceivingItem) {
                $receiving = $linkedReceivingItem->receiving;
                $linkedReceivingItem->delete();
                $receiving?->update([
                    'total_received_qty' => $receiving->items()->sum('actual_qty'),
                ]);
            }

            Batch::where('sj_validation_item_id', $locked->id)->delete();
            $locked->delete();
        });

        $sjValidation->unsetRelation('items');

        return $this->show($sjValidation);
    }

    public function cancel(Request $request, SjValidation $sjValidation): JsonResponse
    {
        $this->authorizeDepot($sjValidation);

        DB::transaction(function () use ($sjValidation) {
            // Kunci + cek ulang di dalam transaksi: dua operator yang menekan
            // Batal bersamaan (atau complete vs cancel) tidak boleh lolos
            // guard status di luar transaksi.
            $locked = SjValidation::query()
                ->whereKey($sjValidation->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_unless(
                $locked->status === 'IN_PROGRESS',
                422,
                "Validasi berstatus {$locked->status} tidak dapat dibatalkan."
            );

            // `completed_at` sengaja TIDAK diisi di sini: dokumen yang dibatalkan
            // tidak pernah "selesai", dan mengisinya akan membuat UI menampilkan
            // waktu selesai untuk dokumen yang tidak pernah diselesaikan.
            // Durasi tetap dicatat karena pekerjaan memang berakhir di sini.
            $cancelledAt = now();
            $locked->update([
                'status' => 'CANCELLED',
                'duration_seconds' => $this->elapsedSeconds($locked, $cancelledAt),
            ]);
            Batch::whereIn(
                'sj_validation_item_id',
                $locked->items()->pluck('id')
            )->update(['status' => 'CANCELLED']);
        });

        return response()->json(['message' => 'Validasi dibatalkan', 'data' => $sjValidation->refresh()]);
    }

    /**
     * Pastikan tepat satu Receiving + ReceivingItems untuk validasi yang selesai.
     * Dipanggil di dalam transaksi complete() — idempoten, aman dipanggil ulang.
     */
    protected function ensureReceiving(SjValidation $sjValidation): array
    {
        $rencanaKirim = $sjValidation->rencanaKirim;

        // GUARD: Cek receiving dengan lockForUpdate untuk mencegah race condition &
        // juga handle kasus receiving yang sudah COMPLETED (tidak perlu create ulang).
        $receiving = Receiving::where('rencana_kirim_id', $rencanaKirim->id)
            ->lockForUpdate()
            ->first();

        if ($receiving) {
            // Jika receiving sudah COMPLETED, return aja (idempotent, jangan create duplicate)
            if ($receiving->status === 'COMPLETED') {
                return [$sjValidation, $receiving];
            }

            // Jika PENDING/IN_PROGRESS, return existing
            return [$sjValidation, $receiving];
        }

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
                // Cap depo/tanggal/sumber sejak lahir (sejajar withOpnameDefaults
                // di ReceivingController::store): group & filter SQL bekerja
                // pada kolom mentah, bukan accessor fallback.
                'sumber_material' => $rencanaKirim->shipper_name,
                'kode_depo' => $rencanaKirim->kode_depo,
                'nama_depo' => $rencanaKirim->nama_depo,
                'tanggal_penerimaan' => today()->toDateString(),
            ]);
        }

        return [$sjValidation, $receiving];
    }
}
