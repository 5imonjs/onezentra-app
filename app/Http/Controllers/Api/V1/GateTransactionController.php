<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GateTransaction;
use App\Models\RencanaKirim;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GateTransactionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = GateTransaction::with(['rencanaKirim']);

        if ($request->user()->isDepotScoped()) {
            $query->whereHas('rencanaKirim', fn ($q) => $q->forUserDepot($request->user()));
        }

        if ($request->gate_type) {
            $query->where('gate_type', $request->gate_type);
        }

        if ($request->status) {
            $query->where('status', $request->status);
        }

        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('nopol', 'like', "%{$request->search}%")
                    ->orWhere('po_transporter', 'like', "%{$request->search}%")
                    ->orWhere('driver_name', 'like', "%{$request->search}%");
            });
        }

        $perPage = $this->perPage($request);
        $transactions = $query->orderBy('created_at', 'desc')->paginate($perPage);

        return response()->json($transactions);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'rencana_kirim_id' => 'required|exists:rencana_kirim,id',
            'gate_type' => 'required|string|in:INBOUND,OUTBOUND',
            'nopol' => 'nullable|string|max:50',
            'driver_name' => 'nullable|string|max:100',
            'po_transporter' => 'nullable|string|max:50',
            'container_number' => 'nullable|string|max:50',
            'notes' => 'nullable|string|max:2000',
        ]);

        $transaction = DB::transaction(function () use ($request, $validated) {
            $rencanaKirim = RencanaKirim::with('creator')
                ->forUserDepot($request->user())
                ->lockForUpdate()
                ->findOrFail($validated['rencana_kirim_id']);

            // Jaga invariant state machine: gate tidak boleh melewati alur validasi/receiving.
            if ($validated['gate_type'] === 'INBOUND' && $rencanaKirim->status !== 'SCHEDULED') {
                abort(422, "Gate INBOUND hanya dapat dilakukan untuk rencana dengan status SCHEDULED (status saat ini: {$rencanaKirim->status}).");
            }

            if ($validated['gate_type'] === 'OUTBOUND' && $rencanaKirim->status !== 'COMPLETED') {
                abort(422, "Gate OUTBOUND hanya dapat dilakukan untuk rencana yang telah COMPLETED melalui receiving/validasi (status saat ini: {$rencanaKirim->status}).");
            }

            abort_unless(
                ! GateTransaction::where('rencana_kirim_id', $rencanaKirim->id)
                    ->where('gate_type', $validated['gate_type'])
                    ->exists(),
                422,
                "Gate {$validated['gate_type']} sudah tercatat untuk rencana ini."
            );

            $transaction = GateTransaction::create([
                ...$validated,
                'scanned_by' => $request->user()->id,
                'scan_time' => now(),
                'status' => 'COMPLETED',
            ]);

            if ($validated['gate_type'] === 'INBOUND') {
                $rencanaKirim->update([
                    'status' => 'CHECKED_IN',
                    'checked_in_at' => now(),
                ]);
            } else {
                // OUTBOUND: pertahankan completed_at yang sudah di-set oleh receiving
                // (jika belum ada, tandai sebagai selesai di sini).
                $rencanaKirim->update([
                    'status' => 'COMPLETED',
                    'completed_at' => $rencanaKirim->completed_at ?? now(),
                ]);
            }

            return $transaction;
        });

        return response()->json([
            'message' => 'Gate transaction recorded successfully',
            'data' => $transaction->load('rencanaKirim'),
        ], 201);
    }

    public function show(GateTransaction $gateTransaction): JsonResponse
    {
        abort_unless(
            auth()->user()?->canAccessDepotRow($gateTransaction->rencanaKirim?->kode_depo, $gateTransaction->rencanaKirim?->nama_depo),
            403,
            'Transaksi gate tidak ditemukan di depo Anda.'
        );

        return response()->json(['data' => $gateTransaction->load('rencanaKirim')]);
    }

    public function byNoDokumen(Request $request): JsonResponse
    {
        $request->validate(['po_transporter' => 'required|string']);

        $rencanaKirim = RencanaKirim::where('po_transporter', $request->po_transporter)
            ->forUserDepot($request->user())
            ->orderBy('created_at', 'desc')
            ->first();

        if (! $rencanaKirim) {
            return response()->json(['message' => 'Rencana kirim tidak ditemukan'], 404);
        }

        return response()->json(['data' => $rencanaKirim->load('items')]);
    }
}
