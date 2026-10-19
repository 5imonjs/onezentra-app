<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\AuthorizesDepotRow;
use App\Http\Controllers\Controller;
use App\Models\Batch;
use App\Support\LikePattern;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BatchController extends Controller
{
    use AuthorizesDepotRow;

    public function index(Request $request): JsonResponse
    {
        $request->validate(['status' => 'nullable|string|in:ACTIVE,CANCELLED']);

        $query = Batch::with(['receiving.rencanaKirim']);

        if ($request->user()->isDepotScoped()) {
            $query->where(function ($q) use ($request) {
                $q->whereHas('receiving.rencanaKirim', fn ($s) => $s->forUserDepot($request->user()))
                    ->orWhereHas('validationItem.validation.rencanaKirim', fn ($s) => $s->forUserDepot($request->user()));
            });
        }

        if ($request->search) {
            $like = LikePattern::contains($request->search);
            $query->whereRaw('batch_number LIKE ? ESCAPE ?', [$like, '\\']);
        }

        if ($request->status) {
            $query->where('status', $request->status);
        }

        $perPage = $this->perPage($request);
        $batches = $query->orderBy('created_at', 'desc')->paginate($perPage);

        return response()->json($batches);
    }

    public function show(Batch $batch): JsonResponse
    {
        $this->authorizeDepot($batch);

        return response()->json(['data' => $batch->load('receiving.rencanaKirim')]);
    }

    private function authorizeDepot(Batch $batch): void
    {
        $rk = $batch->receiving?->rencanaKirim ?? $batch->validationItem?->validation?->rencanaKirim;
        $this->authorizeDepotRow(
            $rk?->kode_depo,
            $rk?->nama_depo,
            'Batch tidak ditemukan di depo Anda.'
        );
    }

    public function byNumber(Request $request): JsonResponse
    {
        $request->validate(['batch_number' => 'required|string']);

        $batch = Batch::where('batch_number', $request->batch_number)->first();

        if (! $batch) {
            return response()->json(['message' => 'Batch not found'], 404);
        }

        $this->authorizeDepot($batch);

        return response()->json(['data' => $batch->load('receiving.rencanaKirim')]);
    }

    /**
     * Tandai label batch sudah dicetak fisik. Sumber kebenaran badge
     * "Label tercetak" (validasi-sj & Inbound) — dipanggil frontend setiap
     * kali tombol Cetak/Unduh label ditekan, dari halaman mana pun.
     * Idempoten dan menolak batch CANCELLED (label mati tidak dicetak ulang).
     */
    public function markPrinted(Request $request, Batch $batch): JsonResponse
    {
        $this->authorizeDepot($batch);

        abort_unless(
            $batch->status !== 'CANCELLED',
            422,
            'Label batch ini sudah dibatalkan dan tidak dapat ditandai tercetak.'
        );

        $batch->markPrinted();

        return response()->json([
            'message' => 'Label ditandai sudah dicetak',
            'data' => $batch->refresh(),
        ]);
    }
}
