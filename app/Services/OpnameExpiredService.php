<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\Npn;
use App\Models\OpnameExpiredAdjustment;
use App\Models\OpnameExpiredBaselineImport;
use App\Models\OpnameExpiredDismissal;
use App\Models\OpnameExpiredSession;
use App\Models\OpnameExpiredSessionItem;
use App\Models\OpnameExpiredWave;
use App\Models\OpnameSetting;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class OpnameExpiredService
{
    public const DEPO_GENERAL = 'GENERAL';

    /** @var array<string, array{date: Carbon, at: Carbon}>|null */
    private ?array $baselineCutoffsCache = null;

    /** @var array<int, array{crt: float, pcs: float}> */
    private array $adjustmentTotals = [];

    /** @var array<string, array{last_wave_id: int, dismissed_week_start: string, dismissed_at: Carbon}>|null */
    private ?array $dismissalsCache = null;

    /**
     * Satuan komposit untuk produk — hanya aktif saat setting global
     * `composite_unit` dinyalakan: nama satuan dari master NPN
     * (UOM komp, fallback UOM staging). Null = tampilkan CRT/BALL/PCS
     * biasa.
     */
    public function compositeUnit(string $kodeBarang): ?string
    {
        if ((int) OpnameSetting::get('composite_unit', 0) === 0) {
            return null;
        }

        $npn = Npn::findByCode($kodeBarang);
        if ($npn === null) {
            return null;
        }

        $desc = trim((string) ($npn->szCompUomDesc ?? ''));
        if ($desc !== '') {
            return $desc;
        }

        return $npn->stagingUom();
    }

    /**
     * Kunci identitas satu baris monitoring: barang|depo|expired.
     */
    private function waveKey(string $kodeBarang, ?string $kodeDepo, ?string $expiredDate): string
    {
        return implode('|', [
            $kodeBarang,
            $kodeDepo ?: self::DEPO_GENERAL,
            $expiredDate ?? '',
        ]);
    }

    /**
     * Penanda penghapusan baris stok kosong per kunci. Dimuat sekali per
     * request agar generate/pending tidak query per baris.
     *
     * @return array<string, array{last_wave_id: int, dismissed_week_start: string, dismissed_at: Carbon}>
     */
    private function dismissals(): array
    {
        if ($this->dismissalsCache !== null) {
            return $this->dismissalsCache;
        }

        $this->dismissalsCache = [];

        foreach (OpnameExpiredDismissal::query()->get() as $dismissal) {
            $this->dismissalsCache[$this->waveKey(
                (string) $dismissal->kode_barang,
                $dismissal->kode_depo,
                $dismissal->expired_date?->toDateString(),
            )] = [
                'last_wave_id' => (int) $dismissal->last_wave_id,
                'dismissed_week_start' => $dismissal->dismissed_week_start?->toDateString() ?? '',
                'dismissed_at' => $dismissal->dismissed_at,
            ];
        }

        return $this->dismissalsCache;
    }

    /**
     * Snapshot yang dihapus operator (stok kosong) tidak boleh dibawa lagi.
     * Batasnya `last_wave_id`: wave yang dibuat SETELAH penghapusan (mis.
     * penerimaan susulan) tetap membawa qty-nya sendiri.
     */
    private function isDismissedCarried(OpnameExpiredWave $carried): bool
    {
        $dismissal = $this->dismissals()[$this->waveKey(
            (string) $carried->kode_barang,
            $carried->kode_depo,
            $carried->expired_date_ini?->toDateString(),
        )] ?? null;

        return $dismissal !== null && (int) $carried->id <= $dismissal['last_wave_id'];
    }

    /**
     * Baris ledger lama untuk kunci yang stok kosongnya sudah dihapus tidak
     * boleh dihitung lagi. Penerimaan yang di-input SETELAH penghapusan tetap
     * masuk (stok baru memang harus muncul di opname berikutnya).
     */
    private function dismissalExcludesItem(ReceivingItem $item, string $key, Carbon $weekStart): bool
    {
        $dismissal = $this->dismissals()[$key] ?? null;

        if ($dismissal === null || $item->created_at === null) {
            return false;
        }

        // Minggu lampau tetap boleh dibaca untuk audit/sesi historis.
        if ($weekStart->toDateString() < $dismissal['dismissed_week_start']) {
            return false;
        }

        return $item->created_at->lessThanOrEqualTo($dismissal['dismissed_at']);
    }

    public function generate(?Carbon $reference = null, ?User $user = null): array
    {
        // Satu transaksi: dua admin yang menekan Generate bersamaan tidak
        // boleh menghasilkan agregat campuran dari bacaan carried yang sama.
        return DB::transaction(function () use ($reference, $user): array {
            $reference ??= Carbon::today();

            $now = Carbon::today();
            $weekStart = $reference->copy()->startOfWeek(Carbon::MONDAY);
            $weekEnd = $weekStart->copy()->endOfWeek(Carbon::SUNDAY)->endOfDay();

            $aman = OpnameSetting::get('threshold_aman', 90);
            $perhatian = OpnameSetting::get('threshold_perhatian', 30);
            $kritis = OpnameSetting::get('threshold_kritis', 7);

            // Self-heal data lama: reset baseline sebelum perbaikan ini hanya
            // membuang ledger + manifes, sedangkan wave turunannya tertinggal
            // di Monitoring Kedaluwarsa dan terus ikut roll-forward. Sapu
            // wave legacy yatim setiap generate agar instalasi yang sudah
            // terlanjur reset ikut bersih tanpa reset ulang.
            $this->purgeOrphanBaselineWaves($user);

            $batis = $this->carriedBatches($weekStart, $user);

            $aggregates = $this->receivingAggregates($weekStart, $user);

            $created = 0;

            foreach ($aggregates as $key => $agg) {
                $carried = $batis[$key] ?? null;
                // Stok kosong yang sudah dihapus operator: jangan bawa qty
                // snapshot lama. Penerimaan baru di $agg tetap dihitung.
                $dismissed = $carried !== null && $this->isDismissedCarried($carried);

                $depo = $agg['kode_depo'];
                $kodeBarang = $agg['kode_barang'];
                $expiredDate = $agg['expired_date'];

                $prevQtyCrt = $carried && ! $dismissed ? $carried->effectiveCrt() : 0;
                $prevQtyPcs = $carried && ! $dismissed ? $carried->effectivePcs() : 0;
                $prevStatus = $carried && ! $dismissed ? $carried->status_ini : null;
                $prevExpired = $carried && ! $dismissed ? $carried->expired_date_ini : null;

                // Roll-forward penuh: qty minggu ini = stok minggu lalu (termasuk
                // yang sudah EXPIRED — tidak boleh hilang dari monitoring sampai
                // ditindak) + penerimaan baru.
                $qtyCrt = $prevQtyCrt + $agg['qty_crt'];
                $qtyPcs = $prevQtyPcs + $agg['qty_pcs'];

                // Baris stok kosong yang sudah dihapus tidak perlu dibentuk
                // ulang (mis. Generate ditekan lagi di minggu yang sama).
                if ($dismissed && $qtyCrt == 0.0 && $qtyPcs == 0.0) {
                    continue;
                }

                $sisaHari = $this->sisaHari(Carbon::parse($expiredDate), $now);
                $status = $this->status($sisaHari, $aman, $perhatian);

                $values = [
                    'week_end' => $weekEnd->toDateString(),
                    'nama_depo' => $agg['nama_depo'],
                    'kode_barang' => $kodeBarang,
                    'nama_barang' => $agg['nama_barang'],
                    'sumber_material' => $agg['sumber_material'],
                    'tanggal_penerimaan' => $agg['tanggal_penerimaan'],
                    'expired_date_ini' => $expiredDate,
                    'expired_date_lalu' => $prevExpired?->toDateString(),
                    'selisih_expired_date' => $prevExpired !== null
                        ? Carbon::parse($expiredDate)->diffInDays($prevExpired, false)
                        : null,
                    'sisa_hari' => $sisaHari,
                    'status_ini' => $status,
                    'status_lalu' => $prevStatus,
                    'perubahan' => $this->perubahan($dismissed ? null : $carried, $prevQtyCrt, $qtyCrt, $prevStatus, $status),
                    'rekomendasi' => $this->rekomendasi($status, $sisaHari),
                    'qty_ini_crt' => $qtyCrt,
                    'qty_ini_pcs' => $qtyPcs,
                    'qty_lalu_crt' => $prevQtyCrt,
                    'qty_lalu_pcs' => $prevQtyPcs,
                    // Gabung jejak batch minggu ini + bawaan minggu lalu.
                    'batch_numbers' => array_values(array_unique(array_merge(
                        $dismissed ? [] : ($carried?->batch_numbers ?? []),
                        $agg['batches'] ?? []
                    ))),
                    // Gabung komposisi sumber minggu ini + bawaan minggu lalu.
                    'source_mix' => [
                        'sj' => ($dismissed ? 0 : ($carried?->source_mix['sj'] ?? 0)) + ($agg['mix']['sj'] ?? 0),
                        'import' => ($dismissed ? 0 : ($carried?->source_mix['import'] ?? 0)) + ($agg['mix']['import'] ?? 0),
                        'legacy' => ($dismissed ? 0 : ($carried?->source_mix['legacy'] ?? 0)) + ($agg['mix']['legacy'] ?? 0),
                    ],
                ];

                OpnameExpiredWave::updateOrCreate(
                    [
                        'week_start' => $weekStart->toDateString(),
                        'kode_depo' => $depo,
                        'kode_barang' => $kodeBarang,
                        'expired_date_ini' => $expiredDate,
                    ],
                    $values
                );

                $created++;
            }

            // Daftarkan ulang batch lama yang masih valid (roll-forward) walaupun tak ada penerimaan baru.
            $batchCount = $this->rollForwardCarried($batis, $aggregates, $weekStart, $weekEnd, $now, $aman, $perhatian, $user);

            return [
                'week_start' => $weekStart->toDateString(),
                'week_end' => $weekEnd->toDateString(),
                'batches' => $created + $batchCount,
                'generated_at' => $now->toDateTimeString(),
            ];
        });
    }

    /**
     * Bawaan (carried) untuk generate minggu target: wave TERBARU per kunci
     * (barang|depo|expired) sebelum minggu target — bukan hanya tepat satu
     * minggu sebelumnya.
     *
     * Kalau satu minggu terlewat (tidak di-generate), rantai roll-forward
     * yang hanya membaca `subWeek()` putus dan stok minggu itu hilang dari
     * monitoring selamanya, meski barangnya masih ada. Mengambil snapshot
     * terakhir per kunci membuat bawaan melompat ke minggu yang benar-benar
     * ada, sehingga stok tetap terbawa ke minggu target berikutnya.
     */
    private function carriedBatches(Carbon $weekStart, ?User $user): array
    {
        $query = OpnameExpiredWave::query()
            ->where('week_start', '<', $weekStart->toDateString())
            ->orderByDesc('week_start')
            ->orderByDesc('id');

        if ($user?->isDepotScoped()) {
            $user->applyDepotFilter($query, 'kode_depo');
        }

        // Baseline adalah snapshot stok lengkap pada saat import. Wave yang
        // terbentuk SEBELUM minggu baseline tidak boleh ikut dibawa lagi —
        // kalau ikut, stok historis + baseline dihitung dua kali.
        $baselineCutoffs = $this->baselineCutoffs();

        $result = [];
        foreach ($query->get() as $row) {
            $depo = $row->kode_depo ?: self::DEPO_GENERAL;
            $cutoff = $baselineCutoffs[$depo] ?? null;

            if ($cutoff !== null) {
                // Wave historis dipotong berdasarkan MINGGU IMPORT, bukan
                // tanggal posisi baseline: wave adalah hasil generate saat
                // input, sedangkan `baseline_date` hanya mengatur cakupan
                // baris ledger. Mencampur keduanya membuat wave minggu yang
                // sama dengan tanggal baseline ikut terbawa dan dobel.
                $baselineWeekStart = $cutoff['at']->copy()->startOfWeek(Carbon::MONDAY)->toDateString();
                if ((string) $row->week_start < $baselineWeekStart) {
                    continue;
                }
            } elseif ((int) ($row->source_mix['legacy'] ?? 0) > 0) {
                // Tidak ada baseline aktif/fallback untuk depo ini: wave
                // bersumber LEGACY adalah sisa baseline yang sudah dihapus.
                // Jangan dibawa lagi ke minggu berjalan (penyebab saldo awal
                // "hidup kembali" setelah reset).
                continue;
            }

            $key = implode('|', [
                $row->kode_barang,
                $row->kode_depo ?: self::DEPO_GENERAL,
                $row->expired_date_ini?->toDateString(),
            ]);

            // Urutan DESC: yang pertama terlihat per kunci adalah yang terbaru.
            $result[$key] ??= $row;
        }

        return $result;
    }

    /**
     * Ringkasan kesiapan generate untuk satu minggu: berapa baris ledger yang
     * memenuhi syarat generate (split SJ vs import) dan berapa yang belum
     * tercermin di wave minggu itu. Basisnya SAMA dengan generate() sehingga
     * angka "belum di-generate" tidak ambigu: baris = ReceivingItem yang lolos
     * filter eligible tapi kuncinya (barang|depo|expired) belum ada di wave.
     *
     * @return array{week_start: string, week_end: string, wave_exists: bool, eligible: array{total: int, sj: int, import: int, legacy: int}, pending: array{total: int, sj: int, import: int, legacy: int}}
     */
    public function pendingSummary(?Carbon $reference = null, ?User $user = null): array
    {
        $reference ??= Carbon::today();
        $weekStart = $reference->copy()->startOfWeek(Carbon::MONDAY);
        $weekEnd = $weekStart->copy()->endOfWeek(Carbon::SUNDAY);

        $waveKeys = OpnameExpiredWave::query()
            ->where('week_start', $weekStart->toDateString())
            ->when($user?->isDepotScoped(), fn ($q) => $user->applyDepotFilter($q, 'kode_depo'))
            ->get()
            ->map(fn ($w) => implode('|', [$w->kode_barang, $w->kode_depo ?: self::DEPO_GENERAL, $w->expired_date_ini?->toDateString()]))
            ->flip();

        $eligible = ['total' => 0, 'sj' => 0, 'import' => 0, 'legacy' => 0];
        $pending = ['total' => 0, 'sj' => 0, 'import' => 0, 'legacy' => 0];

        foreach ($this->eligibleItems($weekStart, $user) as $item) {
            $depo = $item->getKodeDepoFallback() ?: self::DEPO_GENERAL;

            if ($user?->isDepotScoped() && ! $user->canAccessDepotRow($depo, $item->getNamaDepoFallback())) {
                continue;
            }

            $bucket = match ($item->source) {
                ReceivingItem::SOURCE_VALIDASI => 'sj',
                ReceivingItem::SOURCE_IMPORT => 'import',
                ReceivingItem::SOURCE_LEGACY => 'legacy',
                default => null,
            };

            $eligible['total']++;
            if ($bucket) {
                $eligible[$bucket]++;
            }

            $key = implode('|', [$item->kode_barang, $depo, $item->expired_date?->toDateString()]);
            if (! isset($waveKeys[$key])) {
                $pending['total']++;
                if ($bucket) {
                    $pending[$bucket]++;
                }
            }
        }

        return [
            'week_start' => $weekStart->toDateString(),
            'week_end' => $weekEnd->toDateString(),
            'wave_exists' => $waveKeys->isNotEmpty(),
            'eligible' => $eligible,
            'pending' => $pending,
        ];
    }

    /**
     * Query dasar baris ledger yang memenuhi syarat generate.
     *
     * Dua pintu masuk (aturan yang berlaku bersamaan), keduanya mengecualikan
     * batch CANCELLED:
     *
     * 1. JENDELA MINGGU sasaran — perilaku lama tetap berjalan:
     *    - IMPORT_MANUAL (baseline): minggu IMPORT (scan_time/created_at).
     *      Tanggal di file adalah info historis, bukan penentu minggu — baseline
     *      yang diimport minggu ini dipantau minggu ini.
     *    - VALIDASI_SJ: tanggal penerimaan aktual (terima/scan/created).
     * 2. BELUM TERMUAT pada/after minggu jangkarnya — termasuk yang tanggalnya
     *    di luar jendela sasaran. Tanpa pintu kedua ini setiap baris yang
     *    terlewatkan jendela (mis. penerimaan bulan lalu yang baru terdata /
     *    tanggal keliru di file) tidak akan pernah ter-generate selamanya.
     *    Baris yang sudah tercermin di snapshot minggu jangkarnya tetap
     *    dikecualikan agar qty tidak terhitung dua kali. Snapshot yang
     *    diambil sebelum baris di-input tidak dihitung sebagai pencerminan
     *    (penerimaan susulan yang di-input belakangan tetap masuk generate
     *    berikutnya).
     */
    private function eligibleItems(Carbon $weekStart, ?User $user = null)
    {
        $weekEnd = $weekStart->copy()->endOfWeek(Carbon::SUNDAY);
        $weekRange = [$weekStart->toDateString(), $weekEnd->toDateString()];

        // Baseline awal per depo: baris Receiving/SJ yang tanggal efektifnya
        // sudah tercakup oleh import legacy tidak boleh ditambahkan lagi —
        // kalau tidak, produk + expired date yang sama dihitung dua kali
        // (sekali dari baseline, sekali dari Receiving).

        // Batch label punya status sendiri (ACTIVE / CANCELLED). Batch yang
        // dibatalkan — mis. karena sesi validasi di-cancel — labelnya sudah
        // tercetak tapi tidak berlaku, jadi stoknya tidak boleh masuk opname:
        // operator akan melihat rekomendasi kirim/retur untuk label mati.
        //
        // Batch menempel ke baris ledger lewat tiga jalur yang berbeda:
        // - `receiving_id`         → batch dokumen (level receiving), satu batch
        //                            CANCELLED mengeluarkan SEMUA item receiving itu.
        // - `sj_validation_item_id`→ batch hasil scan Validasi SJ (tanpa receiving).
        // - `receiving_item_id`    → batch hasil import manual / verifikasi sesi.
        // Ketiganya wajib diperiksa: pada batch SJ/sesi/import jalur `receiving_id`
        // selalu null, jadi mengeceknya sendirian membuat label mati tetap
        // terhitung di opname.
        $cancelledBatches = Batch::query()->where('status', 'CANCELLED');

        $cancelledReceivingIds = (clone $cancelledBatches)->whereNotNull('receiving_id')->pluck('receiving_id');
        $cancelledValidationItemIds = (clone $cancelledBatches)->whereNotNull('sj_validation_item_id')->pluck('sj_validation_item_id');
        $cancelledLedgerItemIds = (clone $cancelledBatches)->whereNotNull('receiving_item_id')->pluck('receiving_item_id');

        $cancelledItemIds = ReceivingItem::query()
            ->where(fn ($query) => $query
                ->whereIn('receiving_id', $cancelledReceivingIds)
                ->orWhereIn('sj_validation_item_id', $cancelledValidationItemIds)
                ->orWhereIn('id', $cancelledLedgerItemIds))
            ->pluck('id');

        // Wave per kunci (barang|depo|expired), urut terbaru dulu — dipakai
        // pintu kedua untuk memutuskan apakah satu baris ledger sudah
        // tercermin di snapshot mana pun. Bukan sekadar "pernah ada di wave
        // manapun": penerimaan susulan produk yang sama dengan tanggal di
        // minggu yang terlewat — atau yang di-input SETELAH snapshot minggu
        // jangkarnya diambil (mis. penerimaan bulan lalu yang baru di-input
        // hari ini) — harus tetap bisa masuk generate berikutnya, kalau tidak
        // qty-nya hilang selamanya.
        $wavesByKey = [];
        foreach (OpnameExpiredWave::query()
            ->select('kode_barang', 'kode_depo', 'expired_date_ini', 'week_start', 'updated_at')
            ->orderByDesc('week_start')
            ->orderByDesc('id')
            ->get() as $row) {
            $key = implode('|', [
                $row->kode_barang,
                $row->kode_depo ?: self::DEPO_GENERAL,
                $row->expired_date_ini?->toDateString(),
            ]);

            $wavesByKey[$key][] = [
                'week_start' => (string) $row->week_start,
                'updated_at' => $row->updated_at,
            ];
        }

        return ReceivingItem::with(['receiving.rencanaKirim', 'batch', 'verifiedBatch'])
            // Koreksi opname yang sudah disetujui ikut mengubah qty efektif.
            // Jika wave pernah dihapus lalu generate ulang, stok tidak boleh
            // kembali ke qty ledger asli sebelum koreksi.
            ->withSum(['opnameAdjustments as approved_adjustment_crt' => function ($query): void {
                $query->whereNotNull('approved_at');
            }], 'qty_crt')
            ->withSum(['opnameAdjustments as approved_adjustment_pcs' => function ($query): void {
                $query->whereNotNull('approved_at');
            }], 'qty_pcs')
            ->whereNotNull('expired_date')
            ->whereNotNull('kode_barang')
            ->when(
                $cancelledItemIds->isNotEmpty(),
                fn ($q) => $q->whereNotIn('id', $cancelledItemIds)
            )
            ->get()
            ->filter(function (ReceivingItem $item) use ($weekRange, $weekStart, $wavesByKey): bool {
                if ($this->isCoveredByBaseline($item)) {
                    return false;
                }

                $key = $this->waveKey(
                    (string) $item->kode_barang,
                    $item->getKodeDepoFallback(),
                    $item->expired_date?->toDateString(),
                );

                // Stok kosong yang sudah dihapus operator tidak boleh hidup
                // lagi dari baris ledger lama; penerimaan baru (created_at
                // setelah dismissal) tetap masuk.
                if ($this->dismissalExcludesItem($item, $key, $weekStart)) {
                    return false;
                }

                // Pintu 1: jendela minggu (aturan lama).
                $day = $this->monitoringAnchor($item);
                if ($day !== null && $day >= $weekRange[0] && $day <= $weekRange[1]) {
                    return true;
                }

                // Pintu 2: belum tercermin di snapshot mana pun pada/after
                // minggu jangkarnya. Snapshot yang diambil SEBELUM baris ini
                // di-input (updated_at < created_at) tidak bisa merefleksikan
                // baris ini — mis. penerimaan bulan lalu yang baru di-input
                // hari ini untuk produk yang sudah dimonitor — jadi barisnya
                // tetap masuk generate berikutnya. Baris yang sudah tercermin
                // tetap dikecualikan agar qty tidak terhitung dua kali.
                $wavesForKey = $wavesByKey[$key] ?? [];

                if ($wavesForKey === []) {
                    return true;
                }

                if ($day === null) {
                    // Tanpa jangkar: tercermin hanya bila ada snapshot yang
                    // diambil setelah baris ini di-input.
                    foreach ($wavesForKey as $wave) {
                        if ($this->snapshotReflects($wave['updated_at'], $item)) {
                            return false;
                        }
                    }

                    return true;
                }

                $anchorMonday = Carbon::parse($day)->startOfWeek(Carbon::MONDAY)->toDateString();

                foreach ($wavesForKey as $wave) {
                    if ($wave['week_start'] < $anchorMonday) {
                        break;
                    }

                    if ($this->snapshotReflects($wave['updated_at'], $item)) {
                        return false;
                    }
                }

                return true;
            })
            ->values();
    }

    /**
     * Apakah snapshot wave (updated_at-nya) bisa merefleksikan baris ledger
     * ini: snapshot diambil pada/after baris di-input. Wave tanpa updated_at
     * tidak dipakai sebagai bukti tercermin.
     */
    private function snapshotReflects(mixed $updatedAt, ReceivingItem $item): bool
    {
        if ($updatedAt === null || $item->created_at === null) {
            return false;
        }

        return Carbon::parse($updatedAt)->greaterThanOrEqualTo($item->created_at);
    }

    /**
     * Batas cakupan baseline per depo.
     *
     * `date` = tanggal posisi baseline (inklusif) untuk baris yang punya
     * tanggal penerimaan. `at` = waktu import untuk baris tanpa tanggal.
     *
     * Sumber utama: manifes import baseline. Bila data legacy sudah ada tetapi
     * manifes belum tercatat, pakai waktu input paling awal baris LEGACY_IMPORT
     * depo itu.
     *
     * @return array<string, array{date: Carbon, at: Carbon}>
     */
    private function baselineCutoffs(): array
    {
        if ($this->baselineCutoffsCache !== null) {
            return $this->baselineCutoffsCache;
        }

        $cutoffs = [];

        foreach (OpnameExpiredBaselineImport::query()
            ->whereNotNull('kode_depo')
            ->orderBy('imported_at')
            ->get(['kode_depo', 'baseline_date', 'imported_at']) as $import) {
            $depo = (string) $import->kode_depo;
            if (isset($cutoffs[$depo])) {
                continue;
            }

            $at = $import->imported_at?->copy() ?? Carbon::parse($import->baseline_date ?? 'today');
            $date = $import->baseline_date?->copy()->startOfDay() ?? $at->copy()->startOfDay();

            $cutoffs[$depo] = ['date' => $date, 'at' => $at];
        }

        // Fallback untuk data legacy tanpa manifes.
        foreach (ReceivingItem::query()
            ->where('source', ReceivingItem::SOURCE_LEGACY)
            ->whereNotNull('kode_depo')
            ->orderBy('created_at')
            ->get(['kode_depo', 'created_at']) as $legacy) {
            $depo = (string) $legacy->kode_depo;
            if (! isset($cutoffs[$depo]) && $legacy->created_at !== null) {
                $at = Carbon::parse($legacy->created_at);
                $cutoffs[$depo] = ['date' => $at->copy()->startOfDay(), 'at' => $at];
            }
        }

        return $this->baselineCutoffsCache = $cutoffs;
    }

    /**
     * Baris yang merupakan stok awal baseline itu sendiri — bukan duplikat
     * Receiving baru. Source LEGACY_IMPORT adalah baseline; baris yang sudah
     * direklasifikasi ke VALIDASI_SJ tetap membawa `baseline_import_id` dan
     * tidak punya penanda covered manual.
     */
    public function isBaselineRow(ReceivingItem $item): bool
    {
        if ($item->source === ReceivingItem::SOURCE_LEGACY) {
            return true;
        }

        if ($item->baseline_import_id !== null && $item->baseline_covered_at === null) {
            return true;
        }

        // Jaring pengaman data legacy lama yang belum punya manifes: batch
        // LEGACY-* menandai baris lahir dari baseline, walau source-nya sudah
        // direklasifikasi ke VALIDASI_SJ.
        $batchNumber = $item->batch?->batch_number ?? $item->verifiedBatch?->batch_number;

        return is_string($batchNumber) && str_starts_with($batchNumber, 'LEGACY-');
    }

    /**
     * Receiving/SJ yang sudah dicakup baseline tidak boleh dihitung lagi.
     * Baris baseline itu sendiri bukan "covered duplicate".
     */
    public function isCoveredByBaseline(ReceivingItem $item): bool
    {
        return $this->baselineCoverageReason($item) !== null;
    }

    /**
     * Alasan baris dianggap tercakup baseline:
     * - `manual`: ditandai admin lewat koreksi (baseline_covered_at).
     * - `date`: tanggal penerimaan efektif <= tanggal posisi baseline.
     * - `null`: baris baseline itu sendiri, atau stok baru.
     */
    public function baselineCoverageReason(ReceivingItem $item): ?string
    {
        if ($this->isBaselineRow($item)) {
            return null;
        }

        if ($item->baseline_covered_at !== null) {
            return 'manual';
        }

        $depo = $item->getKodeDepoFallback() ?: self::DEPO_GENERAL;
        $cutoff = $this->baselineCutoffs()[$depo] ?? null;

        if ($cutoff === null) {
            return null;
        }

        // Tanggal penerimaan adalah tanggal bisnis yang bisa dikoreksi.
        // Semua penerimaan s.d. tanggal posisi baseline dianggap sudah
        // tercakup, walau baru diinput setelah baseline.
        //
        // Baca kolom mentah: accessor `tanggal_penerimaan` mengembalikan
        // fallback created_at saat kolom kosong, sehingga tidak bisa dipakai
        // untuk membedakan tanggal bisnis dari waktu input.
        $rawTanggal = $item->getRawOriginal('tanggal_penerimaan');
        if ($rawTanggal !== null && $rawTanggal !== '') {
            $tanggal = $rawTanggal instanceof \DateTimeInterface
                ? $rawTanggal->format('Y-m-d')
                : substr((string) $rawTanggal, 0, 10);

            return $tanggal <= $cutoff['date']->toDateString() ? 'date' : null;
        }

        // Baris lama tanpa tanggal penerimaan: pakai momen efektif paling
        // awal yang tersedia, lalu bandingkan dengan waktu import baseline.
        $moment = $item->scan_time
            ?? $item->receiving?->actual_arrival_time
            ?? $item->receiving?->actual_start_time
            ?? $item->receiving?->created_at
            ?? $item->created_at;

        if ($moment === null) {
            return null;
        }

        return Carbon::parse($moment)->lessThanOrEqualTo($cutoff['at']) ? 'date' : null;
    }

    /**
     * Jangkar minggu monitoring per baris, sesuai aturan baku:
     * - IMPORT_MANUAL: tanggal scan/created;
     * - VALIDASI_SJ: tanggal penerimaan / scan / created (yang pertama ada).
     */
    private function monitoringAnchor(ReceivingItem $item): ?string
    {
        $raw = in_array($item->source, [ReceivingItem::SOURCE_IMPORT, ReceivingItem::SOURCE_LEGACY], true)
            ? ($item->scan_time ?? $item->created_at)
            : ($item->tanggal_penerimaan ?? $item->scan_time ?? $item->created_at);

        return $raw ? Carbon::parse($raw)->toDateString() : null;
    }

    private function receivingAggregates(Carbon $weekStart, ?User $user): array
    {
        $items = $this->eligibleItems($weekStart, $user);

        $aggregates = [];

        foreach ($items as $item) {
            $depo = $item->getKodeDepoFallback() ?: self::DEPO_GENERAL;

            if ($user?->isDepotScoped() && ! $user->canAccessDepotRow($depo, $item->getNamaDepoFallback())) {
                continue;
            }

            $sumber = $item->getSumberMaterialFallback() ?: 'N/A';
            $expired = $item->expired_date?->toDateString();

            // Lewati data "produk tidak ditemukan" / pembatalan tanpa expired date.
            $key = implode('|', [$item->kode_barang, $depo, $expired]);

            if (! isset($aggregates[$key])) {
                $aggregates[$key] = [
                    'kode_depo' => $depo,
                    'nama_depo' => $item->getNamaDepoFallback() ?: $depo,
                    'kode_barang' => $item->kode_barang,
                    'nama_barang' => $item->nama_barang ?: $item->kode_barang,
                    'expired_date' => $expired,
                    'sumber_material' => $sumber,
                    'tanggal_penerimaan' => $item->tanggal_penerimaan instanceof Carbon ? $item->tanggal_penerimaan->toDateString() : $item->tanggal_penerimaan,
                    'qty_crt' => 0,
                    'qty_pcs' => 0,
                    'batches' => [],
                    'mix' => ['sj' => 0, 'import' => 0, 'legacy' => 0],
                ];
            }

            $aggregates[$key]['qty_crt'] += (float) $item->actual_qty + (float) ($item->approved_adjustment_crt ?? 0);
            $aggregates[$key]['qty_pcs'] += (float) ($item->qty_pcs ?? 0) + (float) ($item->approved_adjustment_pcs ?? 0);

            // Komposisi sumber untuk penanda visual (SJ murni / Import / Campuran).
            if ($item->source === ReceivingItem::SOURCE_VALIDASI) {
                $aggregates[$key]['mix']['sj']++;
            } elseif ($item->source === ReceivingItem::SOURCE_IMPORT) {
                $aggregates[$key]['mix']['import']++;
            } elseif ($item->source === ReceivingItem::SOURCE_LEGACY) {
                $aggregates[$key]['mix']['legacy']++;
            }

            // Jejak identitas: tiap baris ledger penyusun menyumbang nomor
            // batch-nya (aturan: tiap baris wajib satu batch).
            $batchNumber = $item->batch?->batch_number ?? $item->verifiedBatch?->batch_number;
            if ($batchNumber && ! in_array($batchNumber, $aggregates[$key]['batches'], true)) {
                $aggregates[$key]['batches'][] = $batchNumber;
            }
        }

        return $aggregates;
    }

    private function rollForwardCarried(
        array $batis,
        array $aggregates,
        Carbon $weekStart,
        Carbon $weekEnd,
        Carbon $now,
        int $aman,
        int $perhatian,
        ?User $user
    ): int {
        $count = 0;

        foreach ($batis as $key => $carried) {
            if (isset($aggregates[$key])) {
                continue;
            }

            // Stok kosong yang sudah dihapus operator tidak dibawa lagi.
            if ($this->isDismissedCarried($carried)) {
                continue;
            }

            if ($user?->isDepotScoped() && ! in_array($carried->kode_depo, $user->depot_codes, true)) {
                continue;
            }

            $sisaHari = $this->sisaHari(Carbon::parse($carried->expired_date_ini), $now);
            $status = $this->status($sisaHari, $aman, $perhatian);

            [$kodeBarang, $depo, $expired] = explode('|', $key);

            OpnameExpiredWave::updateOrCreate(
                [
                    'week_start' => $weekStart->toDateString(),
                    'kode_depo' => $depo,
                    'kode_barang' => $kodeBarang,
                    'expired_date_ini' => $expired,
                ],
                [
                    'week_end' => $weekEnd->toDateString(),
                    'nama_depo' => $carried->nama_depo,
                    'nama_barang' => $carried->nama_barang,
                    'sumber_material' => $carried->sumber_material,
                    'tanggal_penerimaan' => $carried->tanggal_penerimaan?->toDateString(),
                    'expired_date_lalu' => $carried->expired_date_ini?->toDateString(),
                    'selisih_expired_date' => 0,
                    'sisa_hari' => $sisaHari,
                    'status_ini' => $status,
                    'status_lalu' => $carried->status_ini,
                    'perubahan' => $this->perubahan($carried, $carried->effectiveCrt(), $carried->effectiveCrt(), $carried->status_ini, $status),
                    'rekomendasi' => $this->rekomendasi($status, $sisaHari),
                    'qty_ini_crt' => $carried->effectiveCrt(),
                    'qty_ini_pcs' => $carried->effectivePcs(),
                    'qty_lalu_crt' => $carried->effectiveCrt(),
                    'qty_lalu_pcs' => $carried->effectivePcs(),
                    'batch_numbers' => $carried->batch_numbers ?? [],
                    'source_mix' => [
                        'sj' => $carried->source_mix['sj'] ?? 0,
                        'import' => $carried->source_mix['import'] ?? 0,
                        'legacy' => $carried->source_mix['legacy'] ?? 0,
                    ],
                ]
            );

            $count++;
        }

        return $count;
    }

    /**
     * Baris ledger penyusun satu wave (kunci barang|depo|expired + jangkar
     * minggu wave, aturan eligible yang sama dengan generate).
     *
     * @return Collection<int, ReceivingItem>
     */
    public function waveSourceItems(OpnameExpiredWave $wave)
    {
        return $this->waveSourceItemsFor(collect([$wave]))[$wave->id] ?? collect();
    }

    /**
     * Sumber ledger untuk banyak wave sekaligus. `eligibleItems()` dihitung
     * sekali per minggu, bukan sekali per wave: sesi besar (ratusan wave)
     * sebelumnya memicu query berat berulang dan bisa timeout.
     *
     * @param  Collection<int, OpnameExpiredWave>  $waves
     * @return array<int, Collection<int, ReceivingItem>>
     */
    public function waveSourceItemsFor(Collection $waves): array
    {
        $sources = [];

        $byWeek = $waves->groupBy(
            fn (OpnameExpiredWave $wave) => Carbon::parse($wave->week_start)
                ->startOfWeek(Carbon::MONDAY)
                ->toDateString()
        );

        foreach ($byWeek as $weekStart => $weekWaves) {
            $eligible = $this->eligibleItems(Carbon::parse($weekStart));

            foreach ($weekWaves as $wave) {
                $sources[$wave->id] = $eligible->filter(
                    fn (ReceivingItem $item) => $item->kode_barang === $wave->kode_barang
                        && ($item->getKodeDepoFallback() ?: self::DEPO_GENERAL) === ($wave->kode_depo ?: self::DEPO_GENERAL)
                        && $item->expired_date?->toDateString() === $wave->expired_date_ini?->toDateString()
                )->values();
            }
        }

        return $sources;
    }

    /**
     * Baris ledger sumber satu Batch (aturan: tiap baris tepat satu batch).
     */
    public function batchSourceItem(Batch $batch): ?ReceivingItem
    {
        if ($batch->receiving_item_id) {
            return ReceivingItem::find($batch->receiving_item_id);
        }

        if ($batch->sj_validation_item_id) {
            return ReceivingItem::where('sj_validation_item_id', $batch->sj_validation_item_id)->first();
        }

        return null;
    }

    /**
     * Penghitungan fisik satu batch oleh petugas lapangan: simpan hasil
     * hitung + disposisi. Base praktik stock opname: PENGHITUNG TIDAK
     * menulis koreksi — angka fisik hanya tercatat di item sesi; koreksi
     * baru berlaku setelah approver independen menyetujui sesi
     * (lihat applyApprovedCorrections).
     *
     * Baris warisan tanpa label diterbitkan susulan (satu-satunya titik
     * penerbitan selain import/SJ) agar tiap hasil hitung fisik menempel ke
     * batch yang jelas.
     *
     * @return array{batches_issued: int}
     */
    public function verifySessionItem(OpnameExpiredSessionItem $item, array $data, User $verifier): array
    {
        return DB::transaction(function () use ($item, $data, $verifier): array {
            // Kunci baris item sesi: verifikasi ganda atas item yang sama
            // (double-tap / dua petugas) terserialisasi di sini.
            $item = OpnameExpiredSessionItem::whereKey($item->id)->lockForUpdate()->firstOrFail();
            // Kunci + cek ulang sesi: penghitungan yang tiba setelah sesi
            // disetujui/dibatalkan (race) wajib ditolak agar keputusan
            // approval tidak berubah kemudian.
            $lockedSession = OpnameExpiredSession::whereKey($item->session_id)->lockForUpdate()->firstOrFail();
            abort_unless($lockedSession->acceptsCounting(), 422, 'Sesi tidak sedang dalam tahap penghitungan.');

            $batch = $item->batch;
            $issued = 0;

            if (! $batch) {
                $source = $this->waveSourceItems($item->wave)->first(
                    fn (ReceivingItem $row) => ! $row->batch && ! $row->verifiedBatch
                );

                if ($source) {
                    $batch = Batch::issueForReceivingItem($source, [
                        'items_json' => [
                            'kode_barang' => $source->kode_barang,
                            'nama_barang' => $source->nama_barang,
                            'qty_crt' => $source->actual_qty,
                            'qty_pcs' => $source->qty_pcs,
                            'expired_date' => $source->expired_date?->toDateString(),
                            'source' => $source->source,
                            'origin' => 'session',
                            'session_item_id' => $item->id,
                        ],
                    ]);
                    $issued = 1;
                }
            }

            $item->update(array_merge([
                'qty_fisik_crt' => $data['qty_fisik_crt'],
                'qty_fisik_pcs' => $data['qty_fisik_pcs'] ?? null,
                'condition' => $data['condition'] ?? null,
                'disposition' => $data['disposition'] ?? null,
                'photo' => $data['photo'] ?? $item->photo,
                'notes' => $data['notes'] ?? null,
                'verified_at' => now(),
                'verified_by' => $verifier->id,
                'verified_via' => $data['identified_via'],
            ], $batch ? ['batch_id' => $batch->id] : []));

            return ['batches_issued' => $issued];
        });
    }

    /**
     * Bekukan qty sistem saat sesi dimulai. Dipanggil sekali di /start;
     * sesudah ini `show()` dan `applyApprovedCorrections()` memakai snapshot,
     * bukan qty live yang bisa berubah karena Receiving baru.
     */
    public function freezeSessionSnapshots(OpnameExpiredSession $session, bool $onlyMissing = false): int
    {
        return DB::transaction(function () use ($session, $onlyMissing): int {
            $query = $session->items()->with(['wave', 'batch'])->lockForUpdate();

            if ($onlyMissing) {
                $query->whereNull('qty_sistem_crt');
            }

            $items = $query->get();

            // Satu query untuk semua batch di sesi — bukan N+1 saat freeze
            // ratusan baris.
            $this->primeAdjustmentTotals(
                $items->pluck('batch_id')->filter()->unique()->values()->all()
            );

            $count = 0;

            foreach ($items as $item) {
                [$crt, $pcs] = $this->resolveExpectedQuantities($item);
                $item->update([
                    'qty_sistem_crt' => $crt,
                    'qty_sistem_pcs' => $pcs,
                ]);
                $count++;
            }

            return $count;
        });
    }

    /**
     * Muat total koreksi per batch dalam satu query. Batch tanpa adjustment
     * diisi nol agar pemanggilan berikutnya tidak query ulang.
     *
     * @param  array<int, int|string>  $batchIds
     */
    public function primeAdjustmentTotals(array $batchIds): void
    {
        $batchIds = array_values(array_unique(array_filter(
            array_map('intval', $batchIds),
            fn (int $id): bool => $id > 0,
        )));

        if ($batchIds === []) {
            return;
        }

        foreach (OpnameExpiredAdjustment::query()
            ->whereIn('batch_id', $batchIds)
            ->whereNotNull('approved_at')
            ->selectRaw('batch_id, COALESCE(SUM(qty_crt), 0) as crt, COALESCE(SUM(qty_pcs), 0) as pcs')
            ->groupBy('batch_id')
            ->get() as $row) {
            $this->adjustmentTotals[(int) $row->batch_id] = [
                'crt' => (float) $row->crt,
                'pcs' => (float) $row->pcs,
            ];
        }

        foreach ($batchIds as $batchId) {
            $this->adjustmentTotals[$batchId] ??= ['crt' => 0.0, 'pcs' => 0.0];
        }
    }

    /**
     * @return array{crt: float, pcs: float}
     */
    private function approvedAdjustmentTotals(?int $batchId): array
    {
        if ($batchId === null) {
            return ['crt' => 0.0, 'pcs' => 0.0];
        }

        if (! array_key_exists($batchId, $this->adjustmentTotals)) {
            $this->primeAdjustmentTotals([$batchId]);
        }

        return $this->adjustmentTotals[$batchId];
    }

    /**
     * Qty acuan sistem satu baris sesi. Batch-level memakai qty ledger batch
     * ditambah seluruh koreksi yang sudah disetujui; baris warisan memakai
     * qty wave efektif (termasuk koreksi yang sudah disetujui sebelumnya).
     *
     * @return array{0: float, 1: float|null}
     */
    public function resolveExpectedQuantities(OpnameExpiredSessionItem $item): array
    {
        $source = $item->batch ? $this->batchSourceItem($item->batch) : null;

        if ($source) {
            $adjustment = $this->approvedAdjustmentTotals($item->batch_id);
            $expectedPcs = $source->qty_pcs !== null
                ? (float) $source->qty_pcs + $adjustment['pcs']
                : ($adjustment['pcs'] !== 0.0 ? $adjustment['pcs'] : null);

            return [
                (float) $source->actual_qty + $adjustment['crt'],
                $expectedPcs,
            ];
        }

        $wave = $item->wave;

        return [
            $wave ? $wave->effectiveCrt() : 0.0,
            $wave ? $wave->effectivePcs() : null,
        ];
    }

    /**
     * Hapus snapshot monitoring milik baseline yang sudah tidak terpasang.
     *
     * Yang disebut yatim adalah wave LEGACY yang kunci
     * `barang|depo|expired`-nya tidak lagi punya baris ledger baseline
     * (`source = LEGACY_IMPORT` atau `baseline_import_id` terisi). Baseline
     * yang masih terpasang selalu punya baris ledger, jadi tidak pernah
     * disentuh; yang dibuang hanya sisa reset (ledger sudah hilang) —
     * termasuk bila setelah reset sempat diimpor ulang file yang isinya
     * tidak lagi memuat produk lama.
     *
     * Wave yang masih dipakai sesi opname BERJALAN dilewati agar snapshot
     * penghitungan yang sedang aktif tidak berubah di tengah jalan. Sesi
     * yang sudah final/batal tidak menghalangi: saldo awal memang boleh
     * dihapus lalu diimpor ulang.
     */
    public function purgeOrphanBaselineWaves(?User $user = null): int
    {
        // Generate dipanggil setiap receiving selesai: batasi pembacaan ke
        // wave LEGACY saja, bukan seluruh tabel monitoring.
        $waveQuery = OpnameExpiredWave::query()
            ->where('source_mix->legacy', '>', 0)
            ->select('id', 'kode_depo', 'kode_barang', 'expired_date_ini');

        if ($user?->isDepotScoped()) {
            $user->applyDepotFilter($waveQuery, 'kode_depo');
        }

        $legacyWaves = $waveQuery->get();

        if ($legacyWaves->isEmpty()) {
            return 0;
        }

        $depotCodes = $legacyWaves
            ->pluck('kode_depo')
            ->map(fn ($depo): string => $depo === null ? self::DEPO_GENERAL : (string) $depo)
            ->unique()
            ->values();

        $ledgerQuery = ReceivingItem::query()
            ->where(fn ($query) => $query
                ->where('source', ReceivingItem::SOURCE_LEGACY)
                ->orWhereNotNull('baseline_import_id'))
            ->whereNotNull('kode_barang')
            ->whereNotNull('expired_date');

        $realDepots = $depotCodes
            ->reject(fn (string $depo): bool => $depo === self::DEPO_GENERAL)
            ->values()
            ->all();

        if ($legacyWaves->contains(fn (OpnameExpiredWave $wave): bool => $wave->kode_depo === null)) {
            $ledgerQuery->where(function ($query) use ($realDepots): void {
                $query->whereNull('kode_depo');

                if ($realDepots !== []) {
                    $query->orWhereIn('kode_depo', $realDepots);
                }
            });
        } else {
            $ledgerQuery->whereIn('kode_depo', $realDepots);
        }

        $validKeys = [];

        foreach ($ledgerQuery->get(['kode_depo', 'kode_barang', 'expired_date']) as $item) {
            $depo = $item->kode_depo ?: self::DEPO_GENERAL;
            $validKeys[$depo.'|'.$item->kode_barang.'|'.($item->expired_date?->toDateString() ?? '')] = true;
        }

        $orphanIds = $legacyWaves
            ->filter(function (OpnameExpiredWave $wave) use ($validKeys): bool {
                $depo = $wave->kode_depo ?: self::DEPO_GENERAL;
                $key = $depo.'|'.$wave->kode_barang.'|'.($wave->expired_date_ini?->toDateString() ?? '');

                return ! isset($validKeys[$key]);
            })
            ->pluck('id');

        if ($orphanIds->isEmpty()) {
            return 0;
        }

        $linkedWaveIds = OpnameExpiredSessionItem::query()
            ->whereIn('wave_id', $orphanIds)
            ->whereHas('session', fn ($query) => $query
                ->whereIn('status', OpnameExpiredSession::OPEN_STATUSES))
            ->pluck('wave_id')
            ->unique();

        $deleteIds = $orphanIds->diff($linkedWaveIds);

        return $deleteIds->isEmpty()
            ? 0
            : OpnameExpiredWave::whereIn('id', $deleteIds->all())->delete();
    }

    /**
     * Guard Receiving: selama sesi opname depo masih terbuka, penambahan
     * stok baru diblokir agar snapshot yang dibekukan di /start tidak
     * berubah di tengah penghitungan.
     */
    public function hasOpenSessionForDepot(?string $kodeDepo): bool
    {
        if (blank($kodeDepo)) {
            return false;
        }

        return OpnameExpiredSession::query()
            ->where('kode_depo', $kodeDepo)
            ->whereIn('status', OpnameExpiredSession::OPEN_STATUSES)
            ->exists();
    }

    /**
     * Sinkronisasi setelah Receiving tervalidasi: jangan tunggu jadwal
     * Senin. Generate bersifat idempotent (updateOrCreate per kunci), jadi
     * aman dipanggil setiap kali receiving selesai.
     */
    public function syncAfterReceiving(Receiving $receiving): void
    {
        if ($receiving->status !== 'COMPLETED') {
            return;
        }

        $this->generate(Carbon::today(), null);
    }

    /**
     * Terapkan koreksi wave hasil sesi yang DISETUJUI (dipanggil service
     * approval). Koreksi dihitung SEKALI dari hasil hitung terakhir tiap
     * item — bukan ditambah per event verifikasi — sehingga verifikasi
     * ulang tidak menggandakan selisih dan angka koreksi selalu konsisten
     * dengan isi sesi terkini.
     *
     * Per wave:
     * - item berbatch : selisih = fisik − qty ledger batch ini, dijumlah
     *   seluruh batch (koreksi multi-batch satu wave saling menjumlah).
     * - item warisan tanpa batch (wave tanpa baris ledger): selisih =
     *   fisik − qty wave minggu ini.
     *
     * Setiap selisih juga ditulis ke `opname_expired_adjustments` (ledger
     * koreksi per batch) agar sesi berikutnya memakai qty yang sudah
     * dikoreksi, dan disposisi RETUR/DISPOSAL mengarantina batch.
     *
     * Penanda koreksi memakai identitas PETUGAS (koreksi_by = angka), penanda
     * validasi memakai identitas APPROVER (validated_by = setuju).
     */
    public function applyApprovedCorrections(OpnameExpiredSession $lockedSession, User $approver): int
    {
        $wavesTouched = 0;

        $items = $lockedSession->items()->whereNotNull('verified_at')->with('batch')->get();

        // Snapshot qty acuan sudah dibekukan saat sesi dimulai. Di sini hanya
        // perlu memuat total koreksi lama untuk audit/fallback; jangan biarkan
        // sesi yang sama menambah koreksi dua kali bila approval diulang.
        $this->primeAdjustmentTotals(
            $items->pluck('batch_id')->filter()->unique()->values()->all()
        );

        foreach ($items->groupBy('wave_id') as $waveId => $waveItems) {
            $wave = OpnameExpiredWave::whereKey($waveId)->lockForUpdate()->firstOrFail();

            $deltaCrt = 0.0;
            $deltaPcs = 0.0;

            foreach ($waveItems as $waveItem) {
                $fisikCrt = (float) ($waveItem->qty_fisik_crt ?? 0);
                $fisikPcs = (float) ($waveItem->qty_fisik_pcs ?? 0);

                $source = $waveItem->batch ? $this->batchSourceItem($waveItem->batch) : null;

                if ($source) {
                    $expectedCrt = $waveItem->qty_sistem_crt !== null
                        ? (float) $waveItem->qty_sistem_crt
                        : (float) $source->actual_qty;
                    $expectedPcs = $waveItem->qty_sistem_pcs !== null
                        ? (float) $waveItem->qty_sistem_pcs
                        : (float) ($source->qty_pcs ?? 0);
                } else {
                    // Wave tanpa baris ledger (warisan / carried murni):
                    // acuan pembandingnya snapshot sesi, atau qty wave efektif
                    // bila sesi lama belum punya snapshot.
                    $expectedCrt = $waveItem->qty_sistem_crt !== null
                        ? (float) $waveItem->qty_sistem_crt
                        : $wave->effectiveCrt();
                    $expectedPcs = $waveItem->qty_sistem_pcs !== null
                        ? (float) $waveItem->qty_sistem_pcs
                        : $wave->effectivePcs();
                }

                $adjustment = OpnameExpiredAdjustment::firstOrCreate(
                    [
                        'session_id' => $lockedSession->id,
                        'wave_id' => $wave->id,
                        'item_key' => OpnameExpiredAdjustment::itemKeyFor($waveItem->batch),
                    ],
                    [
                        'batch_id' => $waveItem->batch_id,
                        'receiving_item_id' => $source?->id,
                        'qty_crt' => $fisikCrt - $expectedCrt,
                        'qty_pcs' => $fisikPcs - $expectedPcs,
                        'expected_crt' => $expectedCrt,
                        'expected_pcs' => $expectedPcs,
                        'physical_crt' => $fisikCrt,
                        'physical_pcs' => $fisikPcs,
                        'disposition' => $waveItem->disposition,
                        'notes' => $waveItem->notes,
                        'approved_by' => $approver->id,
                        'approved_at' => now(),
                    ]
                );

                // Approval yang terulang tidak boleh menggandakan koreksi.
                if (! $adjustment->wasRecentlyCreated) {
                    continue;
                }

                $deltaCrt += (float) $adjustment->qty_crt;
                $deltaPcs += (float) $adjustment->qty_pcs;

                if ($source && $waveItem->batch
                    && in_array($waveItem->disposition, [
                        OpnameExpiredSessionItem::DISPOSITION_RETUR,
                        OpnameExpiredSessionItem::DISPOSITION_DISPOSAL,
                    ], true)) {
                    $waveItem->batch->quarantine(
                        $approver,
                        $lockedSession,
                        sprintf(
                            'Disposisi %s dari sesi opname #%d.',
                            $waveItem->disposition,
                            $lockedSession->id,
                        ),
                    );
                }
            }

            // Increment atomik: pembacaan lalu tulis biasa dapat menimpa
            // koreksi transaksi pesaing yang commit di antara baca dan tulis.
            if ($deltaCrt !== 0.0) {
                $wave->increment('qty_koreksi_crt', $deltaCrt);
            }
            if ($deltaPcs !== 0.0) {
                $wave->increment('qty_koreksi_pcs', $deltaPcs);
            }
            $wave->update([
                // Identitas petugas diambil dari petugas yang ditugaskan —
                // tahap "kirim" sudah dihapus, jadi submitted_by tidak diisi.
                'koreksi_by' => $lockedSession->assigned_to,
                'koreksi_at' => $lockedSession->submitted_at ?? now(),
                'validated_by' => $approver->id,
                'validated_at' => now(),
            ]);

            $wavesTouched++;
        }

        // Koreksi baru sudah tercatat; buang cache agar pemakaian service
        // berikutnya di request yang sama membaca total terbaru.
        $this->adjustmentTotals = [];

        return $wavesTouched;
    }

    private function sisaHari(Carbon $expiredDate, Carbon $now): int
    {
        // copy() agar $now / $expiredDate milik pemanggil tidak termutasi ke
        // tengah malam — generate() memakai $now untuk generated_at sesudahnya.
        return (int) $now->copy()->startOfDay()->diffInDays($expiredDate->copy()->startOfDay(), false);
    }

    private function status(int $sisaHari, int $aman, int $perhatian): string
    {
        if ($sisaHari < 0) {
            return 'EXPIRED';
        }

        if ($sisaHari >= $aman) {
            return 'AMAN';
        }

        if ($sisaHari >= $perhatian) {
            return 'PERHATIAN';
        }

        return 'KRITIS';
    }

    private function rekomendasi(string $status, int $sisaHari): string
    {
        return match ($status) {
            'AMAN' => 'Stok aman, jalankan FEFO normal (expired terdekat keluar dulu).',
            'PERHATIAN' => "Mulai prioritaskan produk ini, sisa {$sisaHari} hari.",
            'KRITIS' => $sisaHari <= OpnameSetting::get('threshold_kritis', 7)
                ? "SEGERA kirim/retur, sisa {$sisaHari} hari."
                : "Waspada, sisa {$sisaHari} hari.",
            'EXPIRED' => 'BATCH EXPIRED — wajib ditarik/diretur dan dikoreksi stok.',
            default => '',
        };
    }

    private function perubahan(?OpnameExpiredWave $carried, float $prevQtyCrt, float $qtyCrt, ?string $prevStatus, string $status): string
    {
        $parts = [];

        if (! $carried) {
            $parts[] = 'BARU';
        } else {
            $delta = $qtyCrt - $prevQtyCrt;
            if (abs($delta) < 0.005) {
                $parts[] = 'TETAP';
            } elseif ($delta > 0) {
                $parts[] = 'NAIK +'.$delta;
            } else {
                $parts[] = 'TURUN '.$delta;
            }

            if ($prevStatus && $prevStatus !== $status) {
                $parts[] = "status {$prevStatus} → {$status}";
            }
        }

        return implode('; ', $parts);
    }
}
