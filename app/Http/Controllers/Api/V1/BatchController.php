<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\AuthorizesDepotRow;
use App\Http\Controllers\Controller;
use App\Models\Batch;
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
            $query->where('batch_number', 'like', "%{$request->search}%");
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
}
