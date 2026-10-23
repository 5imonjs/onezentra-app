<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DepoController extends Controller
{
    /**
     * Master depo, tersumber dari data grup (kode_depo + nama_depo) pada tabel users.
     * User yang di-scope ke depo hanya melihat depo miliknya sendiri.
     */
    public function index(Request $request): JsonResponse
    {
        $query = User::query()
            ->whereNotNull('kode_depo')
            ->where('kode_depo', '!=', '');

        if ($request->user()->isDepotScoped()) {
            $request->user()->applyDepotFilter($query, 'kode_depo');
        }

        $depos = $query->groupBy('kode_depo', 'nama_depo')
            ->orderBy('nama_depo')
            ->get(['kode_depo', 'nama_depo'])
            ->map(fn (User $user) => [
                'kode_depo' => $user->kode_depo,
                'nama_depo' => $user->nama_depo,
            ])
            ->values();

        return response()->json(['data' => $depos]);
    }
}
