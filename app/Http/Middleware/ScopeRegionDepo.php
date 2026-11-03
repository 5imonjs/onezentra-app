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

        // If request explicitly passes region, validate isolation (prevent IDOR).
        // Kode region bisa string ("REG-A") — bandingkan dengan sameRegion(),
        // bukan cast int yang membuat semua kode non-numerik jadi 0.
        $reqRegion = $request->input('region_id') ?? $request->route('region_id');

        if ($reqRegion !== null && ! $this->sameRegion($reqRegion, $regionId)) {
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

        // Catatan: kode_depo dari body/query TIDAK diverifikasi di middleware.
        // Kontrak scoping kode depo (clamp untuk user terruping, bebas untuk
        // admin/depot.view_all) ditetapkan di controller masing-masing
        // (RencanaKirim, gate, report, email recipients) agar alur
        // crossdepot yang sah (impian admin, item journal) tetap jalan.

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
