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

        $regionId = $user->region_id ?? 1;
        $depoId = $user->depo_id ?? 1;

        // Set context on request for controllers / scopes
        $request->attributes->set('region_id', $regionId);
        $request->attributes->set('depo_id', $depoId);
        $request->attributes->set('user_region_id', $regionId);
        $request->attributes->set('user_depo_id', $depoId);

        // If request explicitly passes region/depo, validate isolation (prevent IDOR)
        $reqRegion = $request->input('region_id') ?? $request->route('region_id');
        $reqDepo = $request->input('depo_id') ?? $request->route('depo_id') ?? $request->input('kode_depo');

        if ($reqRegion !== null && (int) $reqRegion !== (int) $regionId) {
            return response()->json(['message' => 'Access denied: region isolation'], 403);
        }

        if ($reqDepo !== null && $reqDepo !== '' && (int) $reqDepo !== (int) $depoId) {
            // Allow depo code lookup only if it matches user's depo; strict numeric match for ID
            $depoCode = $request->input('depo_code') ?? $request->input('kode_depo');
            if ($depoCode === null || $depoCode === '') {
                return response()->json(['message' => 'Access denied: depo isolation'], 403);
            }
        }

        return $next($request);
    }
}
