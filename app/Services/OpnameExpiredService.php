<?php

namespace App\Services;

use App\Models\OpnameExpiredWave;
use App\Models\OpnameSetting;
use App\Models\ReceivingItem;
use App\Models\User;
use Illuminate\Support\Carbon;

class OpnameExpiredService
{
    private const DEPO_GENERAL = 'GENERAL';

    public function generate(?Carbon $reference = null, ?User $user = null): array
    {
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

            // Roll-forward penuh: qty minggu ini = stok lama yang belum expired + penerimaan baru.
            // Batch yang sudah EXPIRED tidak ikut di-roll ke depan (keluar dari opname).
            $qtyCrt = ($prevStatus === 'EXPIRED' ? 0 : $prevQtyCrt) + $agg['qty_crt'];
            $qtyPcs = ($prevStatus === 'EXPIRED' ? 0 : $prevQtyPcs) + $agg['qty_pcs'];

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

    private function receivingAggregates(Carbon $weekStart, ?User $user): array
    {
        $weekRange = [$weekStart->toDateString(), $weekStart->copy()->endOfWeek(Carbon::SUNDAY)->toDateString()];

        $items = ReceivingItem::with(['receiving.rencanaKirim'])
            ->whereNotNull('expired_date')
            ->whereNotNull('kode_barang')
            ->whereRaw('COALESCE(tanggal_penerimaan, DATE(scan_time), DATE(created_at)) BETWEEN ? AND ?', $weekRange)
            ->get();

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
                    'tanggal_penerimaan' => $item->tanggal_penerimaan instanceof \Illuminate\Support\Carbon ? $item->tanggal_penerimaan->toDateString() : $item->tanggal_penerimaan,
                    'qty_crt' => 0,
                    'qty_pcs' => 0,
                ];
            }

            $aggregates[$key]['qty_crt'] += (float) $item->actual_qty;
            $aggregates[$key]['qty_pcs'] += (float) ($item->qty_pcs ?? 0);
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
            if ($carried->status_ini === 'EXPIRED') {
                continue;
            }

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
                ]
            );

            $count++;
        }

        return $count;
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
