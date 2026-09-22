<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ApprovalAssignment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BiayaConfigController extends Controller
{
    /**
     * Nilai runtime terpusat untuk modul biaya: ambang nominal per modul
     * (global) + nama RFAH hasil resolve assignment depo (fallback global).
     * Frontend wajib memakai endpoint ini, bukan literal.
     */
    public function show(Request $request): JsonResponse
    {
        $kodeDepo = trim((string) $request->input('kode_depo', ''));
        if ($kodeDepo === '' && $request->user()->isDepotScoped()) {
            $kodeDepo = $request->user()->kode_depo;
        }

        return response()->json([
            'data' => [
                'rfah_name' => ApprovalAssignment::resolveRfahName($kodeDepo !== '' ? $kodeDepo : null),
                'thl_rfah_threshold' => (int) config('biaya.thl_rfah_threshold', 750000),
                'retribusi_rfah_threshold' => (int) config('biaya.retribusi_rfah_threshold', 1000000),
            ],
        ]);
    }
}
