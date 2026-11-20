<?php

namespace App\Services;

use App\Models\RencanaKirim;

/**
 * Durasi operasional per PO, dihitung dari dua pasangan waktu yang benar:
 *
 * - Check-in → Selesai : rencana_kirim.checked_in_at (atau scan_time gate)
 *                        sampai receivings.actual_end_time / completed_at.
 * - Durasi bongkar     : receivings.actual_start_time (fallback created_at)
 *                        sampai receivings.actual_end_time.
 *
 * Catatan: receivings.created_at adalah saat dokumen penerimaan dibuat
 * (setelah validasi SJ selesai), bukan klik "mulai bongkar" operator.
 */
class ReceivingDurationService
{
    /** @return array{checkin_at: ?string, finish_at: ?string, unload_minutes: ?int, total_minutes: ?int, unload_label: string, total_label: string} */
    public function metrics(RencanaKirim $rencanaKirim): array
    {
        $checkin = $rencanaKirim->checked_in_at
            ?? $rencanaKirim->gateTransactions->first()?->scan_time;

        $receiving = $rencanaKirim->receivings->first();
        $finish = $receiving?->actual_end_time ?? $rencanaKirim->completed_at;
        $start = $receiving?->actual_start_time ?? $receiving?->created_at;

        $unload = $start && $finish ? abs((int) $finish->diffInMinutes($start)) : null;
        $total = $checkin && $finish ? abs((int) $finish->diffInMinutes($checkin)) : null;

        return [
            'checkin_at' => $checkin?->toIso8601String(),
            'finish_at' => $finish?->toIso8601String(),
            'unload_minutes' => $unload,
            'total_minutes' => $total,
            'unload_label' => $this->format($unload),
            'total_label' => $this->format($total),
        ];
    }

    public function format(?int $minutes): string
    {
        if ($minutes === null) {
            return '-';
        }

        $hours = intdiv($minutes, 60);
        $rest = $minutes % 60;

        if ($hours === 0) {
            return "{$rest}m";
        }

        return $rest === 0 ? "{$hours}j" : "{$hours}j {$rest}m";
    }
}
