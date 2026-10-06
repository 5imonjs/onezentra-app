<?php

namespace App\Services;

use App\Models\Batch;
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
            $query->where('kode_depo', $user->kode_depo);
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
            ->when($user?->isDepotScoped(), fn ($q) => $q->where('kode_depo', $user->kode_depo))
            ->get()
            ->map(fn ($w) => implode('|', [$w->kode_barang, $w->kode_depo ?: self::DEPO_GENERAL, $w->expired_date_ini?->toDateString()]))
            ->flip();

        $eligible = ['total' => 0, 'sj' => 0, 'import' => 0];
        $pending = ['total' => 0, 'sj' => 0, 'import' => 0];

        foreach ($this->eligibleItems($weekStart, $user)->get() as $item) {
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
     * Jangkar minggu MONITORING berbeda per sumber (aturan baku):
     * - IMPORT_MANUAL (baseline): minggu IMPORT (scan_time/created_at).
     *   Tanggal di file adalah info historis, bukan penentu minggu — baseline
     *   yang diimport minggu ini dipantau minggu ini.
     * - VALIDASI_SJ: tanggal penerimaan aktual (terima/scan/created).
     *
     * Keduanya tetap mengecualikan dokumen berlabel CANCELLED.
     */
    private function eligibleItems(Carbon $weekStart, ?User $user = null)
    {
        $weekRange = [$weekStart->toDateString(), $weekStart->copy()->endOfWeek(Carbon::SUNDAY)->toDateString()];

        // Batch label punya status sendiri (ACTIVE / CANCELLED). Batch yang
        // dibatalkan — mis. karena sesi validasi di-cancel — labelnya sudah
        // tercetak tapi tidak berlaku, jadi stoknya tidak boleh masuk opname:
        // operator akan melihat rekomendasi kirim/retur untuk label mati.
        //
        // Batch relating ke Receiving lewat `receiving_id` (level dokumen), bukan
        // per item. Jadi satu batch CANCELLED mengeluarkan semua item pada
        // receiving tersebut dari opname — conservative dan sesuai makna "seluruh
        // batch label ikut dibatalkan" saat pembatalan sesi.
        $cancelledItemIds = ReceivingItem::whereIn(
            'receiving_id',
            Batch::query()->where('status', 'CANCELLED')->whereNotNull('receiving_id')->pluck('receiving_id')
        )->pluck('id');

        return ReceivingItem::with(['receiving.rencanaKirim', 'batch', 'verifiedBatch'])
            ->whereNotNull('expired_date')
            ->whereNotNull('kode_barang')
            ->when(
                $cancelledItemIds->isNotEmpty(),
                fn ($q) => $q->whereNotIn('id', $cancelledItemIds)
            )
            ->whereRaw(
                'CASE WHEN source = ? THEN COALESCE(DATE(scan_time), DATE(created_at)) ELSE COALESCE(tanggal_penerimaan, DATE(scan_time), DATE(created_at)) END BETWEEN ? AND ?',
                [ReceivingItem::SOURCE_IMPORT, ...$weekRange]
            );
    }

    private function receivingAggregates(Carbon $weekStart, ?User $user): array
    {
        $items = $this->eligibleItems($weekStart, $user)->get();

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

            if ($user?->isDepotScoped() && $carried->kode_depo !== $user->kode_depo) {
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

        return $this->eligibleItems($weekStart)->get()->filter(
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
     * Verifikasi satu batch sesi oleh petugas lapangan: simpan hasil fisik
     * → tulis koreksi + validasi ke wave. Koreksi dihitung sebagai SELISIH
     * per batch (fisik − qty ledger batch ini) sehingga verifikasi
     * multi-batch dalam satu wave saling menjumlah dengan benar.
     * Baris warisan tanpa label diterbitkan susulan (satu-satunya titik
     * penerbitan selain import/SJ).
     *
     * @return array{batches_issued: int}
     */
    public function verifySessionItem(OpnameExpiredSessionItem $item, array $data, User $verifier): array
    {
        // Transaksi + kunci baris wave: dua petugas yang memverifikasi dua
        // batch satu wave bersamaan tidak boleh saling menimpa koreksi.
        return DB::transaction(function () use ($item, $data, $verifier): array {
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
                'photo' => $data['photo'] ?? $item->photo,
                'notes' => $data['notes'] ?? null,
                'verified_at' => now(),
                'verified_by' => $verifier->id,
                'verified_via' => $data['identified_via'],
            ], $batch ? ['batch_id' => $batch->id] : []));

            $wave = OpnameExpiredWave::whereKey($item->wave_id)->lockForUpdate()->firstOrFail();
            $source = $batch ? $this->batchSourceItem($batch) : null;

            if ($source) {
                $wave->update([
                    'qty_koreksi_crt' => (float) $wave->qty_koreksi_crt + ((float) $data['qty_fisik_crt'] - (float) $source->actual_qty),
                    'qty_koreksi_pcs' => (float) $wave->qty_koreksi_pcs + (((float) ($data['qty_fisik_pcs'] ?? 0)) - (float) ($source->qty_pcs ?? 0)),
                    'koreksi_by' => $verifier->id,
                    'koreksi_at' => now(),
                    'validated_by' => $verifier->id,
                    'validated_at' => now(),
                ]);
            } else {
                $wave->update([
                    'qty_koreksi_crt' => (float) $data['qty_fisik_crt'] - (float) $wave->qty_ini_crt,
                    'qty_koreksi_pcs' => ((float) ($data['qty_fisik_pcs'] ?? 0)) - (float) $wave->qty_ini_pcs,
                    'koreksi_by' => $verifier->id,
                    'koreksi_at' => now(),
                    'validated_by' => $verifier->id,
                    'validated_at' => now(),
                ]);
            }

            return ['batches_issued' => $issued];
        });
    }

    private function sisaHari(Carbon $expiredDate, Carbon $now): int
    {
        return (int) $now->startOfDay()->diffInDays($expiredDate->startOfDay());
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
