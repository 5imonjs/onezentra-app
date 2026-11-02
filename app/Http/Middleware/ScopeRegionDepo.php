<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ScopeRegionDepo
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = auth()->user();

        if (! $user) {
            return $next($request);
        }

        $regionId = $user->region_id;
        $depoId = $user->depo_id;
        $depoCode = $user->kode_depo;

        // Set context on request for controllers / scopes
        $request->attributes->set('region_id', $regionId);
        $request->attributes->set('depo_id', $depoId);
        $request->attributes->set('user_region_id', $regionId);
        $request->attributes->set('user_depo_id', $depoId);

        // Master scope bersifat global; jangan blokir filter yang sah.
        if ($user->isMasterScope()) {
            return $next($request);
        }

        // If request explicitly passes region/depo, validate isolation (prevent IDOR)
        $reqRegion = $request->input('region_id') ?? $request->route('region_id');

        if ($reqRegion !== null && (int) $reqRegion !== (int) $regionId) {
            return response()->json(['message' => 'Access denied: region isolation'], 403);
        }

        $reqDepoId = $request->input('depo_id') ?? $request->route('depo_id');

        if (
            $reqDepoId !== null
            && $reqDepoId !== ''
            && (int) $reqDepoId !== (int) $depoId
        ) {
            return response()->json(['message' => 'Access denied: depo isolation'], 403);
        }

        $reqDepoCode = $request->input('kode_depo')
            ?? $request->input('depo_code')
            ?? $request->route('kode_depo');

        if ($reqDepoCode !== null && $reqDepoCode !== '') {
            // `depot_codes` mendukung multi-depot; fallback ke kode_depo legacy
            // agar akun lama tidak ikut ditolak.
            $allowedCodes = array_map('strval', $user->depot_codes);

            if (filled($depoCode)) {
                $allowedCodes[] = (string) $depoCode;
            }

            $allowedCodes = array_values(array_unique($allowedCodes));

            if (! empty($allowedCodes) && ! in_array((string) $reqDepoCode, $allowedCodes, true)) {
                return response()->json(['message' => 'Access denied: depo isolation'], 403);
            }
        }

        return $next($request);
    }

    /**
     * Bandingkan region code secara longgar untuk data lama ("1" vs "001"),
     * tetapi tetap case-sensitive untuk kode non-numerik seperti "REG-1".
     */
    private function sameRegion(mixed $left, mixed $right): bool
    {
        if ((string) $left === (string) $right) {
            return true;
        }

        if (is_numeric($left) && is_numeric($right)) {
            return (int) $left === (int) $right;
        }

        return false;
    }
}