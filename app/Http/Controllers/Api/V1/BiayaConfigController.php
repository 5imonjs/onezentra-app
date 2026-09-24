<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ApprovalAssignment;
use App\Models\RetribusiRate;
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
        $module = $request->input('module') === ApprovalAssignment::MODULE_RETRIBUSI
            ? ApprovalAssignment::MODULE_RETRIBUSI
            : ApprovalAssignment::MODULE_THL;

        return response()->json([
            'data' => [
                'rfah_name' => ApprovalAssignment::resolveRfahName($kodeDepo !== '' ? $kodeDepo : null, $module),
                'thl_rfah_threshold' => (int) config('biaya.thl_rfah_threshold', 750000),
                'retribusi_rfah_threshold' => (int) config('biaya.retribusi_rfah_threshold', 1000000),
                ...$this->retribusiCalc($kodeDepo),
            ],
        ]);
    }

    /**
     * Logika hitung retribusi depo: mode borongan (nominal manual) atau
     * koli (nominal = qty_zak * rate_zak + qty_crt * rate_crt).
     *
     * @return array{retribusi_calc_mode: string, retribusi_rate_zak: int, retribusi_rate_crt: int}
     */
    private function retribusiCalc(string $kodeDepo): array
    {
        $resolved = RetribusiRate::resolveFor($kodeDepo !== '' ? $kodeDepo : null);

        return [
            'retribusi_calc_mode' => $resolved['mode'],
            'retribusi_rate_zak' => (int) $resolved['rate_zak'],
            'retribusi_rate_crt' => (int) $resolved['rate_crt'],
        ];
    }
}
