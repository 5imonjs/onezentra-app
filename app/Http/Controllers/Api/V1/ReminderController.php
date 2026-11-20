<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GateTransaction;
use App\Models\RencanaKirim;
use App\Models\SjValidation;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Reminder keterlambatan proses operasional untuk web dan mobile.
 *
 * Satu kontrak API dipakai kedua klien supaya angka dan statusnya tidak bisa
 * berbeda. Ambang batas dan scope (permission + depo) dihitung di server;
 * klien hanya menampilkan. Tidak ada notifikasi push/local di mobile —
 * reminder berupa badge/banner yang di-fetch saat halaman dibuka.
 */
class ReminderController extends Controller
{
    /** Menit sebelum sebuah proses dianggap terlambat. */
    private const THRESHOLD_MINUTES = 30;

    /** Batasi payload: cukup untuk ditampilkan, sisanya lewat halaman modul. */
    private const MAX_PER_GROUP = 5;

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $cutoff = now()->subMinutes(self::THRESHOLD_MINUTES);
        $kodeDepo = $request->string('kode_depo')->toString() ?: null;

        $groups = [];

        if ($user->hasPermission('sj_validation.view')) {
            $groups[] = $this->sjValidationGroup($user, $cutoff, $kodeDepo);
        }

        if ($user->hasPermission('gate.view')) {
            $groups[] = $this->gateGroup($user, $cutoff, $kodeDepo);
        }

        if ($user->hasPermission('rencana_kirim.view') && $user->hasPermission('rencana_kirim.edit')) {
            $groups[] = $this->rencanaKirimGroup($user, $cutoff, $kodeDepo);
        }

        $groups = array_values(array_filter($groups));

        return response()->json([
            'data' => [
                'threshold_minutes' => self::THRESHOLD_MINUTES,
                'generated_at' => now()->toIso8601String(),
                'total' => collect($groups)->sum('count'),
                'groups' => $groups,
            ],
        ]);
    }

    /** @return array<string, mixed>|null */
    private function sjValidationGroup($user, $cutoff, ?string $kodeDepo): ?array
    {
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

        $rows = $query->orderBy('started_at')->limit(self::MAX_PER_GROUP)->get();

        if ($rows->isEmpty()) {
            return null;
        }

        return [
            'key' => 'sj_validation',
            'label' => 'Validasi SJ belum selesai',
            'href' => '/validasi-sj',
            'count' => $rows->count(),
            'items' => $rows->map(fn (SjValidation $row) => [
                'id' => $row->id,
                'title' => $row->rencanaKirim?->po_transporter ?: $row->scan_code ?: "Validasi #{$row->id}",
                'subtitle' => $row->rencanaKirim?->nama_depo ?: ($row->rencanaKirim?->kode_depo ?? '-'),
                'elapsed_minutes' => $this->elapsedMinutes($row->started_at ?? $row->created_at),
                'at' => ($row->started_at ?? $row->created_at)?->toIso8601String(),
            ])->all(),
        ];
    }

    /** @return array<string, mixed>|null */
    private function gateGroup($user, $cutoff, ?string $kodeDepo): ?array
    {
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

        $rows = $query->orderBy('scan_time')->limit(self::MAX_PER_GROUP)->get();

        if ($rows->isEmpty()) {
            return null;
        }

        return [
            'key' => 'gate',
            'label' => 'Kendaraan tertahan di gate',
            'href' => '/gate',
            'count' => $rows->count(),
            'items' => $rows->map(fn (GateTransaction $row) => [
                'id' => $row->id,
                'title' => $row->nopol ?: ($row->po_transporter ?: "Gate #{$row->id}"),
                'subtitle' => $row->rencanaKirim?->nama_depo ?: ($row->po_transporter ?: '-'),
                'elapsed_minutes' => $this->elapsedMinutes($row->scan_time ?? $row->created_at),
                'at' => ($row->scan_time ?? $row->created_at)?->toIso8601String(),
            ])->all(),
        ];
    }

    /** @return array<string, mixed>|null */
    private function rencanaKirimGroup($user, $cutoff, ?string $kodeDepo): ?array
    {
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

        $rows = $query->orderBy('checked_in_at')->limit(self::MAX_PER_GROUP)->get(['id', 'po_transporter', 'nopol', 'kode_depo', 'nama_depo', 'checked_in_at', 'created_at']);

        if ($rows->isEmpty()) {
            return null;
        }

        return [
            'key' => 'rencana_kirim',
            'label' => 'Rencana kirim belum diverifikasi',
            'href' => '/rencana-kirim',
            'count' => $rows->count(),
            'items' => $rows->map(fn (RencanaKirim $row) => [
                'id' => $row->id,
                'title' => $row->po_transporter ?: ($row->nopol ?: "RK #{$row->id}"),
                'subtitle' => $row->nama_depo ?: ($row->kode_depo ?? '-'),
                'elapsed_minutes' => $this->elapsedMinutes($row->checked_in_at ?? $row->created_at),
                'at' => ($row->checked_in_at ?? $row->created_at)?->toIso8601String(),
            ])->all(),
        ];
    }

    /**
     * User depot-scoped terkunci ke deponya; filter kode_depo dari klien hanya
     * dipakai user global (konsisten dengan kontrak modul lain).
     *
     * @param  Builder  $query
     */
    private function scopeDepot($query, $user, ?string $kodeDepo, bool $viaRencana = true): void
    {
        if ($user->isDepotScoped()) {
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

    private function elapsedMinutes(?Carbon $at): int
    {
        return $at ? max(0, (int) $at->diffInMinutes(now())) : 0;
    }
}
