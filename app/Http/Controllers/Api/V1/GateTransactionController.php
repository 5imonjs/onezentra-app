<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GateTransaction;
use App\Models\RencanaKirim;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GateTransactionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'status' => 'nullable|string|in:CHECKED_IN,COMPLETED',
            'gate_type' => 'nullable|string|in:INBOUND',  // Hanya INBOUND digunakan, OUTBOUND tidak aktif
        ]);

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

        // Filter depo untuk dashboard (user global); user depot-scoped sudah
        // terkunci forUserDepot di atas sehingga filter ini hanya mempersempit.
        if ($request->filled('kode_depo')) {
            $query->whereHas('rencanaKirim', fn ($q) => $q->where('kode_depo', $request->input('kode_depo')));
        }

        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('nopol', 'like', "%{$request->search}%")
                    ->orWhere('po_transporter', 'like', "%{$request->search}%")
                    ->orWhere('driver_name', 'like', "%{$request->search}%");
            });
        }

        if ($request->date_from) {
            $query->whereDate('scan_time', '>=', $request->date_from);
        }

        if ($request->date_to) {
            $query->whereDate('scan_time', '<=', $request->date_to);
        }

        $perPage = $this->perPage($request);
        $transactions = $query->orderBy('created_at', 'desc')->paginate($perPage);

        return response()->json($transactions);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'rencana_kirim_id' => 'required|exists:rencana_kirim,id',
            'gate_type' => 'required|string|in:INBOUND',
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

            // GUARD: Cek existencia dengan lockForUpdate untuk mencegah race condition
            // antara request concurrent yang sama sekali membuat duplicate gate transaction.
            $existingGate = GateTransaction::where('rencana_kirim_id', $rencanaKirim->id)
                ->where('gate_type', $validated['gate_type'])
                ->lockForUpdate()
                ->first();

            abort_unless(
                ! $existingGate,
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
            $this->currentUser()->canAccessDepotRow($gateTransaction->rencanaKirim?->kode_depo, $gateTransaction->rencanaKirim?->nama_depo),
            403,
            'Transaksi gate tidak ditemukan di depo Anda.'
        );

        return response()->json(['data' => $gateTransaction->load('rencanaKirim')]);
    }

    /**
     * Lookup satu rencana kirim dari nomor yang diinput operator.
     *
     * Field query tetap `po_transporter` (dipakai web & mobile), tapi nilainya
     * dicocokkan ke `po_transporter` ATAU `nopol` karena kedua layar menyebut
     * kolomnya "PO / Nopol". Match dilakukan persis (setelah trim) — partial
     * match berisiko mengembalikan dokumen milik orang lain, dan dokumen itu
     * lalu bisa langsung di-Gate-IN dari layar.
     */
    public function byNoDokumen(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'po_transporter' => ['required', 'string', 'max:100'],
        ]);

        $nomor = trim($validated['po_transporter']);

        $rencanaKirim = RencanaKirim::query()
            ->forUserDepot($request->user())
            ->where(function (Builder $q) use ($nomor): void {
                $q->where('po_transporter', $nomor)
                    ->orWhere('nopol', $nomor);
            })
            ->orderBy('created_at', 'desc')
            ->first();

        if (! $rencanaKirim) {
            return response()->json(['message' => 'Rencana kirim tidak ditemukan'], 404);
        }

        return response()->json(['data' => $rencanaKirim->load('items')]);
    }

    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();

        $gateQuery = GateTransaction::query();
        $rkQuery = RencanaKirim::query();

        if ($user->isDepotScoped()) {
            $gateQuery->whereHas('rencanaKirim', fn ($q) => $q->forUserDepot($user));
            $rkQuery->forUserDepot($user);
        }

        $today = now()->toDateString();

        $gateTotal = $gateQuery->count();
        $gateToday = (clone $gateQuery)->whereDate('scan_time', $today)->count();
        $rkScheduled = (clone $rkQuery)->where('status', 'SCHEDULED')->count();
        $rkCompleted = (clone $rkQuery)->where('status', 'COMPLETED')->count();

        return response()->json([
            'data' => [
                'total' => $gateTotal,
                'hari_ini' => $gateToday,
                'terjadwal' => $rkScheduled,
                'selesai' => $rkCompleted,
            ],
        ]);
    }

    public function update(Request $request, GateTransaction $gateTransaction): JsonResponse
    {
        abort_unless(
            $this->currentUser()->canAccessDepotRow($gateTransaction->rencanaKirim?->kode_depo, $gateTransaction->rencanaKirim?->nama_depo),
            403,
            'Transaksi gate tidak ditemukan di depo Anda.'
        );

        // Gate transactions are typically created from scan process, so edit is limited
        $validated = $request->validate([
            'notes' => 'nullable|string|max:1000',
        ]);
        $gateTransaction->update($validated);

        return response()->json(['message' => 'Gate transaction updated', 'data' => $gateTransaction]);
    }

    public function destroy(GateTransaction $gateTransaction): JsonResponse
    {
        abort_unless(
            $this->currentUser()->canAccessDepotRow($gateTransaction->rencanaKirim?->kode_depo, $gateTransaction->rencanaKirim?->nama_depo),
            403,
            'Transaksi gate tidak ditemukan di depo Anda.'
        );

        // Menghapus jejak gate tidak boleh meninggalkan status yatim: hanya
        // INBOUND yang rencananya masih CHECKED_IN yang bisa dibatalkan
        // (rencana kembali SCHEDULED). OUTBOUND/alur yang sudah jalan = jejak
        // audit, tidak bisa dihapus.
        abort_unless(
            $gateTransaction->gate_type === 'INBOUND' && $gateTransaction->rencanaKirim?->status === 'CHECKED_IN',
            422,
            'Transaksi gate ini tidak dapat dihapus pada status alur saat ini.'
        );

        $gateTransaction->rencanaKirim->update(['status' => 'SCHEDULED']);
        $gateTransaction->delete();

        return response()->json(['message' => 'Gate transaction deleted']);
    }
}
