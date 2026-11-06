<?php

namespace App\Services;

use App\Models\Batch;
use App\Models\OpnameExpiredSession;
use App\Models\OpnameExpiredSessionItem;
use App\Models\OpnameExpiredWave;
use App\Models\OpnameSetting;
use App\Models\ReceivingItem;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class OpnameExpiredService
{
    private const DEPO_GENERAL = 'GENERAL';

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

            $batis = $this->carriedBatches($weekStart, $user);

            $aggregates = $this->receivingAggregates($weekStart, $user);

            foreach ($aggregates as $key => $agg) {
                $carried = $batis[$key] ?? null;

                $depo = $agg['kode_depo'];
                $kodeBarang = $agg['kode_barang'];
                $expiredDate = $agg['expired_date'];

                $prevQtyCrt = $carried ? $carried->effectiveCrt() : 0;
                $prevQtyPcs = $carried ? $carried->effectivePcs() : 0;
                $prevStatus = $carried ? $carried->status_ini : null;
                $prevExpired = $carried ? $carried->expired_date_ini : null;

                // Roll-forward penuh: qty minggu ini = stok minggu lalu (termasuk
                // yang sudah EXPIRED — tidak boleh hilang dari monitoring sampai
                // ditindak) + penerimaan baru.
                $qtyCrt = $prevQtyCrt + $agg['qty_crt'];
                $qtyPcs = $prevQtyPcs + $agg['qty_pcs'];

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
                    'expired_date_lalu' => $carried ? $prevExpired?->toDateString() : null,
                    'selisih_expired_date' => $carried
                        ? Carbon::parse($expiredDate)->diffInDays($prevExpired, false)
                        : null,
                    'sisa_hari' => $sisaHari,
                    'status_ini' => $status,
                    'status_lalu' => $prevStatus,
                    'perubahan' => $this->perubahan($carried, $prevQtyCrt, $qtyCrt, $prevStatus, $status),
                    'rekomendasi' => $this->rekomendasi($status, $sisaHari),
                    'qty_ini_crt' => $qtyCrt,
                    'qty_ini_pcs' => $qtyPcs,
                    'qty_lalu_crt' => $prevQtyCrt,
                    'qty_lalu_pcs' => $prevQtyPcs,
                    // Gabung jejak batch minggu ini + bawaan minggu lalu.
                    'batch_numbers' => array_values(array_unique(array_merge(
                        $carried?->batch_numbers ?? [],
                        $agg['batches'] ?? []
                    ))),
                    // Gabung komposisi sumber minggu ini + bawaan minggu lalu.
                    'source_mix' => [
                        'sj' => ($carried?->source_mix['sj'] ?? 0) + ($agg['mix']['sj'] ?? 0),
                        'import' => ($carried?->source_mix['import'] ?? 0) + ($agg['mix']['import'] ?? 0),
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
            }

            // Daftarkan ulang batch lama yang masih valid (roll-forward) walaupun tak ada penerimaan baru.
            $batchCount = $this->rollForwardCarried($batis, $aggregates, $weekStart, $weekEnd, $now, $aman, $perhatian, $user);

            return [
                'week_start' => $weekStart->toDateString(),
                'week_end' => $weekEnd->toDateString(),
                'batches' => count($aggregates) + $batchCount,
                'generated_at' => $now->toDateTimeString(),
            ];
        });
    }

    private function carriedBatches(Carbon $weekStart, ?User $user): array
    {
        $prevWeekStart = $weekStart->copy()->subWeek();

        $query = OpnameExpiredWave::query()->where('week_start', $prevWeekStart->toDateString());

        if ($user?->isDepotScoped()) {
            $user->applyDepotFilter($query, 'kode_depo');
        }

        $result = [];
        foreach ($query->get() as $row) {
            $depo = $row->kode_depo ?: self::DEPO_GENERAL;
            $result[implode('|', [$row->kode_barang, $depo, $row->expired_date_ini?->toDateString()])] = $row;
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
     * @return array{week_start: string, week_end: string, wave_exists: bool, eligible: array{total: int, sj: int, import: int}, pending: array{total: int, sj: int, import: int}}
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

        $eligible = ['total' => 0, 'sj' => 0, 'import' => 0];
        $pending = ['total' => 0, 'sj' => 0, 'import' => 0];

        foreach ($this->eligibleItems($weekStart, $user) as $item) {
            $depo = $item->getKodeDepoFallback() ?: self::DEPO_GENERAL;

            if ($user?->isDepotScoped() && ! $user->canAccessDepotRow($depo, $item->getNamaDepoFallback())) {
                continue;
            }

            $bucket = match ($item->source) {
                ReceivingItem::SOURCE_VALIDASI => 'sj',
                ReceivingItem::SOURCE_IMPORT => 'import',
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
     * 2. BELUM TERMUAT di wave manapun — termasuk yang tanggalnya di luar
     *    jendela sasaran. Tanpa pintu kedua ini setiap baris yang terlewatkan
     *    jendela (mis. penerimaan bulan lalu yang baru terdata / tanggal keliru
     *    di file) tidak akan pernah ter-generate selamanya.
     */
    private function eligibleItems(Carbon $weekStart, ?User $user = null)
    {
        $weekEnd = $weekStart->copy()->endOfWeek(Carbon::SUNDAY);
        $weekRange = [$weekStart->toDateString(), $weekEnd->toDateString()];

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

        // Kunci-kunci yang pernah termuat ke wave manapun (carried atau minggu
        // lampau) — dipakai pintu kedua agar barang yang terlewat jendela tidak
        // terhitung dua kali.
        $waveKeys = OpnameExpiredWave::query()
            ->select('kode_barang', 'kode_depo', 'expired_date_ini')
            ->get()
            ->map(fn ($row) => implode('|', [
                $row->kode_barang,
                $row->kode_depo ?: self::DEPO_GENERAL,
                $row->expired_date_ini?->toDateString(),
            ]))
            ->flip();

        return ReceivingItem::with(['receiving.rencanaKirim', 'batch', 'verifiedBatch'])
            ->whereNotNull('expired_date')
            ->whereNotNull('kode_barang')
            ->when(
                $cancelledItemIds->isNotEmpty(),
                fn ($q) => $q->whereNotIn('id', $cancelledItemIds)
            )
            ->get()
            ->filter(function (ReceivingItem $item) use ($weekRange, $waveKeys): bool {
                // Pintu 1: jendela minggu (aturan lama).
                $day = $this->monitoringAnchor($item);
                if ($day !== null && $day >= $weekRange[0] && $day <= $weekRange[1]) {
                    return true;
                }

                // Pintu 2: belum pernah masuk wave manapun — barang ini
                // termastikan tidak pernah ter-generate sekalipun jendela
                // minggunya sudah lewat.
                $key = implode('|', [
                    $item->kode_barang,
                    $item->getKodeDepoFallback() ?: self::DEPO_GENERAL,
                    $item->expired_date?->toDateString(),
                ]);

                return ! $waveKeys->has($key);
            })
            ->values();
    }

    /**
     * Jangkar minggu monitoring per baris, sesuai aturan baku:
     * - IMPORT_MANUAL: tanggal scan/created;
     * - VALIDASI_SJ: tanggal penerimaan / scan / created (yang pertama ada).
     */
    private function monitoringAnchor(ReceivingItem $item): ?string
    {
        $raw = $item->source === ReceivingItem::SOURCE_IMPORT
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
                    'mix' => ['sj' => 0, 'import' => 0],
                ];
            }

            $aggregates[$key]['qty_crt'] += (float) $item->actual_qty;
            $aggregates[$key]['qty_pcs'] += (float) ($item->qty_pcs ?? 0);

            // Komposisi sumber untuk penanda visual (SJ murni / Import / Campuran).
            if ($item->source === ReceivingItem::SOURCE_VALIDASI) {
                $aggregates[$key]['mix']['sj']++;
            } elseif ($item->source === ReceivingItem::SOURCE_IMPORT) {
                $aggregates[$key]['mix']['import']++;
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
                    'source_mix' => $carried->source_mix ?? ['sj' => 0, 'import' => 0],
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
        $weekStart = Carbon::parse($wave->week_start)->startOfWeek(Carbon::MONDAY);

        return $this->eligibleItems($weekStart)->filter(
            fn (ReceivingItem $item) => $item->kode_barang === $wave->kode_barang
                && ($item->getKodeDepoFallback() ?: self::DEPO_GENERAL) === ($wave->kode_depo ?: self::DEPO_GENERAL)
                && $item->expired_date?->toDateString() === $wave->expired_date_ini?->toDateString()
        )->values();
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
     * Penanda koreksi memakai identitas PETUGAS (koreksi_by = angka), penanda
     * validasi memakai identitas APPROVER (validated_by = setuju).
     */
    public function applyApprovedCorrections(OpnameExpiredSession $lockedSession, User $approver): int
    {
        $wavesTouched = 0;

        $items = $lockedSession->items()->whereNotNull('verified_at')->with('batch')->get();

        foreach ($items->groupBy('wave_id') as $waveId => $waveItems) {
            $wave = OpnameExpiredWave::whereKey($waveId)->lockForUpdate()->firstOrFail();

            $deltaCrt = 0.0;
            $deltaPcs = 0.0;

            foreach ($waveItems as $waveItem) {
                $fisikCrt = (float) ($waveItem->qty_fisik_crt ?? 0);
                $fisikPcs = (float) ($waveItem->qty_fisik_pcs ?? 0);

                $source = $waveItem->batch ? $this->batchSourceItem($waveItem->batch) : null;

                if ($source) {
                    $deltaCrt += $fisikCrt - (float) $source->actual_qty;
                    $deltaPcs += $fisikPcs - (float) ($source->qty_pcs ?? 0);
                } else {
                    // Wave tanpa baris ledger (warisan / carried murni):
                    // acuan pembandingnya qty wave minggu ini.
                    $deltaCrt += $fisikCrt - (float) $wave->qty_ini_crt;
                    $deltaPcs += $fisikPcs - (float) $wave->qty_ini_pcs;
                }
            }

            // Increment atomik: pembacaan lalu tulis biasa dapat menimpa
            // koreksi transaksi pesaing yang commit di antara baca dan tulis.
            $wave->increment('qty_koreksi_crt', $deltaCrt);
            $wave->increment('qty_koreksi_pcs', $deltaPcs);
            $wave->update([
                'koreksi_by' => $lockedSession->submitted_by,
                'koreksi_at' => $lockedSession->submitted_at ?? now(),
                'validated_by' => $approver->id,
                'validated_at' => now(),
            ]);

            $wavesTouched++;
        }

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
            'AMAN' => 'Stok aman, jalankan FIFO normal.',
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
