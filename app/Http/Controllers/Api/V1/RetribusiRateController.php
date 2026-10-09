<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\RetribusiRate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RetribusiRateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = RetribusiRate::query()->orderBy('kode_depo');

        // Tarif bersifat per-depo; user ber-scope hanya melihat depo sendiri.
        if ($user->isDepotScoped()) {
            $query->where('kode_depo', $user->kode_depo);
        }

        return response()->json(['data' => $query->get()]);
    }

    public function upsert(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'kode_depo' => 'required|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'mode' => 'required|string|in:borongan,koli',
            'rate_zak' => 'nullable|numeric|min:0',
            'rate_crt' => 'nullable|numeric|min:0',
            'is_active' => 'nullable|boolean',
        ]);

        abort_unless(
            $request->user()->canAccessDepotRow($validated['kode_depo']),
            403,
            'Anda tidak memiliki akses ke depo ini.'
        );

        $rate = RetribusiRate::updateOrCreate(
            ['kode_depo' => $validated['kode_depo']],
            [
                'nama_depo' => $validated['nama_depo'] ?? $validated['kode_depo'],
                'mode' => $validated['mode'],
                'rate_zak' => $validated['mode'] === 'koli' ? (float) ($validated['rate_zak'] ?? 0) : 0,
                'rate_crt' => (float) ($validated['rate_crt'] ?? 0),
                'is_active' => $validated['is_active'] ?? true,
            ]
        );

        return response()->json(['message' => 'Tarif retribusi disimpan.', 'data' => $rate]);
    }

    public function destroy(Request $request, string $kodeDepo): JsonResponse
    {
        abort_unless(
            $request->user()->canAccessDepotRow($kodeDepo),
            403,
            'Anda tidak memiliki akses ke depo ini.'
        );

        RetribusiRate::where('kode_depo', $kodeDepo)->delete();

        return response()->json(['message' => 'Tarif retribusi dihapus, kembali ke bawaan config.']);
    }
}
