<?php

namespace App\Services\Reminder;

use App\Models\GateTransaction;
use App\Models\RencanaKirim;
use App\Models\SjValidation;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Carbon;

/**
 * Satu sumber kebenaran untuk "proses apa yang terlambat".
 *
 * Dipakai oleh endpoint web/mobile (ReminderController) dan scheduler email
 * (SendOverdueReminders) supaya ambang batas dan statusnya tidak bisa drift.
 */
class OverdueProcessService
{
    /** Menit sebelum sebuah proses dianggap terlambat. */
    public const THRESHOLD_MINUTES = 30;

    /** Batasi payload API: cukup untuk ditampilkan, sisanya lewat halaman modul. */
    public const MAX_PER_GROUP = 5;

    public function cutoff(): Carbon
    {
        return now()->subMinutes(self::THRESHOLD_MINUTES);
    }

    /** @return Collection<int, SjValidation> */
    public function sjValidations(?User $user, ?string $kodeDepo, int $limit = self::MAX_PER_GROUP): Collection
    {
        $cutoff = $this->cutoff();
        $query = SjValidation::query()
            ->where('status', 'IN_PROGRESS')
            ->where(function ($q) use ($cutoff) {
                $q->whereNotNull('started_at')
                    ->where('started_at', '<=', $cutoff)
                    ->orWhere(function ($q2) use ($cutoff) {
                        $q2->whereNull('started_at')->where('created_at', '<=', $cutoff);
                    });
            })
            ->with('rencanaKirim:id,po_transporter,nopol,kode_depo,nama_depo');

        $this->scopeDepot($query, $user, $kodeDepo);

        return $query->orderBy('started_at')->limit($limit)->get();
    }

    /** @return Collection<int, GateTransaction> */
    public function gateTransactions(?User $user, ?string $kodeDepo, int $limit = self::MAX_PER_GROUP): Collection
    {
        $cutoff = $this->cutoff();
        $query = GateTransaction::query()
            ->where('status', 'CHECKED_IN')
            ->where(function ($q) use ($cutoff) {
                $q->whereNotNull('scan_time')
                    ->where('scan_time', '<=', $cutoff)
                    ->orWhere(function ($q2) use ($cutoff) {
                        $q2->whereNull('scan_time')->where('created_at', '<=', $cutoff);
                    });
            })
            ->with('rencanaKirim:id,po_transporter,kode_depo,nama_depo');

        $this->scopeDepot($query, $user, $kodeDepo);

        return $query->orderBy('scan_time')->limit($limit)->get();
    }

    /** @return Collection<int, RencanaKirim> */
    public function rencanaKirim(?User $user, ?string $kodeDepo, int $limit = self::MAX_PER_GROUP): Collection
    {
        $cutoff = $this->cutoff();
        $query = RencanaKirim::query()
            ->where('status', 'CHECKED_IN')
            ->where(function ($q) use ($cutoff) {
                $q->whereNotNull('checked_in_at')
                    ->where('checked_in_at', '<=', $cutoff)
                    ->orWhere(function ($q2) use ($cutoff) {
                        $q2->whereNull('checked_in_at')->where('created_at', '<=', $cutoff);
                    });
            });

        $this->scopeDepot($query, $user, $kodeDepo, false);

        return $query->orderBy('checked_in_at')
            ->limit($limit)
            ->get(['id', 'po_transporter', 'nopol', 'kode_depo', 'nama_depo', 'checked_in_at', 'created_at']);
    }

    /**
     * Rencana kirim yang sudah lewat ETA tetapi belum check-in di gate.
     * Ini berbeda dengan reminder gate (yang sudah CHECKED_IN terlalu lama).
     *
     * @return Collection<int, RencanaKirim>
     */
    public function etaOverdueRencana(int $limit = self::MAX_PER_GROUP): Collection
    {
        return RencanaKirim::query()
            ->whereNotNull('eta_date')
            ->whereDate('eta_date', '<', now()->toDateString())
            ->whereNull('checked_in_at')
            ->whereNotIn('status', ['COMPLETED', 'CANCELLED'])
            ->orderBy('eta_date')
            ->limit($limit)
            ->get(['id', 'po_transporter', 'nopol', 'kode_depo', 'nama_depo', 'rkh_date', 'eta_date', 'created_at']);
    }

    public function elapsedMinutes(?Carbon $at): int
    {
        return $at ? max(0, (int) $at->diffInMinutes(now())) : 0;
    }

    /**
     * User depot-scoped terkunci ke deponya; filter kode_depo dari klien hanya
     * dipakai user global. Scheduler memanggil dengan user=null (semua depo).
     */
    private function scopeDepot(Builder $query, ?User $user, ?string $kodeDepo, bool $viaRencana = true): void
    {
        if ($user !== null && $user->isDepotScoped()) {
            if ($viaRencana) {
                $query->whereHas('rencanaKirim', fn ($q) => $q->forUserDepot($user));
            } else {
                $user->applyDepotFilter($query, 'kode_depo');
            }

            return;
        }

        if ($kodeDepo !== null && $kodeDepo !== '') {
            if ($viaRencana) {
                $query->whereHas('rencanaKirim', fn ($q) => $q->where('kode_depo', $kodeDepo));
            } else {
                $query->where('kode_depo', $kodeDepo);
            }
        }
    }
}
