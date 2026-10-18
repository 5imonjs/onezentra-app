<?php

namespace App\Services\Biaya;

use Illuminate\Database\Eloquent\Builder;

/**
 * Ringkasan antrean biaya per level approval untuk blok dashboard role-aware.
 * Dipakai bersama oleh Biaya THL dan Biaya Retribusi.
 */
class BiayaQueueSummary
{
    /**
     * @param  Builder  $summaryQuery  Query yang sudah dipersempit ke baris terfilter (belum dipaginasi).
     * @return array{check: array{count: int, nominal: float, oldest_days: int|null}, approve: array{count: int, nominal: float, oldest_days: int|null}, rfah: array{count: int, nominal: float, oldest_days: int|null}}
     */
    public static function build(Builder $summaryQuery): array
    {
        $byStatus = (clone $summaryQuery)->reorder()->toBase()
            ->selectRaw('status, COUNT(*) as c, COALESCE(SUM(nominal_biaya), 0) as nominal, MIN(COALESCE(submitted_at, created_at)) as oldest')
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $rfah = (clone $summaryQuery)->reorder()
            ->where('status', 'rlh_approved')
            ->where('is_rfah_required', true)
            ->toBase()
            ->selectRaw('COUNT(*) as c, COALESCE(SUM(nominal_biaya), 0) as nominal, MIN(COALESCE(submitted_at, created_at)) as oldest')
            ->first();

        return [
            'check' => self::row($byStatus->get('pending')),
            'approve' => self::row($byStatus->get('checked')),
            'rfah' => self::row($rfah),
        ];
    }

    /**
     * @return array{count: int, nominal: float, oldest_days: int|null}
     */
    public static function row(?object $row): array
    {
        $oldest = $row->oldest ?? null;

        return [
            'count' => (int) ($row->c ?? 0),
            'nominal' => (float) ($row->nominal ?? 0),
            'oldest_days' => $oldest
                ? max(0, (int) floor((now()->getTimestamp() - strtotime((string) $oldest)) / 86400))
                : null,
        ];
    }
}
