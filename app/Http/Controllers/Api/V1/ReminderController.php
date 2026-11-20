<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GateTransaction;
use App\Models\RencanaKirim;
use App\Models\SjValidation;
use App\Models\User;
use App\Services\Reminder\OverdueProcessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reminder keterlambatan proses operasional untuk web dan mobile.
 *
 * Satu kontrak API dipakai kedua klien supaya angka dan statusnya tidak bisa
 * berbeda. Query keterlambatan berada di OverdueProcessService yang sama
 * dengan scheduler email.
 */
class ReminderController extends Controller
{
    public function __construct(private readonly OverdueProcessService $overdue) {}

    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $kodeDepo = $request->string('kode_depo')->toString() ?: null;

        $groups = [];

        if ($user->hasPermission('sj_validation.view')) {
            $groups[] = $this->sjValidationGroup($user, $kodeDepo);
        }

        if ($user->hasPermission('gate.view')) {
            $groups[] = $this->gateGroup($user, $kodeDepo);
        }

        if ($user->hasPermission('rencana_kirim.view') && $user->hasPermission('rencana_kirim.edit')) {
            $groups[] = $this->rencanaKirimGroup($user, $kodeDepo);
        }

        $groups = array_values(array_filter($groups));

        return response()->json([
            'data' => [
                'threshold_minutes' => OverdueProcessService::THRESHOLD_MINUTES,
                'generated_at' => now()->toIso8601String(),
                'total' => collect($groups)->sum('count'),
                'groups' => $groups,
            ],
        ]);
    }

    /** @return array<string, mixed>|null */
    private function sjValidationGroup(User $user, ?string $kodeDepo): ?array
    {
        $rows = $this->overdue->sjValidations($user, $kodeDepo);
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
                'elapsed_minutes' => $this->overdue->elapsedMinutes($row->started_at ?? $row->created_at),
                'at' => ($row->started_at ?? $row->created_at)?->toIso8601String(),
            ])->all(),
        ];
    }

    /** @return array<string, mixed>|null */
    private function gateGroup(User $user, ?string $kodeDepo): ?array
    {
        $rows = $this->overdue->gateTransactions($user, $kodeDepo);
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
                'elapsed_minutes' => $this->overdue->elapsedMinutes($row->scan_time ?? $row->created_at),
                'at' => ($row->scan_time ?? $row->created_at)?->toIso8601String(),
            ])->all(),
        ];
    }

    /** @return array<string, mixed>|null */
    private function rencanaKirimGroup(User $user, ?string $kodeDepo): ?array
    {
        $rows = $this->overdue->rencanaKirim($user, $kodeDepo);
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
                'elapsed_minutes' => $this->overdue->elapsedMinutes($row->checked_in_at ?? $row->created_at),
                'at' => ($row->checked_in_at ?? $row->created_at)?->toIso8601String(),
            ])->all(),
        ];
    }
}
