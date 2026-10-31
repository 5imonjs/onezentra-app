<?php

namespace App\Http\Controllers\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class RegionDepoValidationController
{
    public function validateRegion(Request $request): JsonResponse
    {
        $regionCode = $request->input('region_code');

        if (! $regionCode) {
            return response()->json(['valid' => false, 'message' => 'Region code required'], 400);
        }

        $region = \DB::table('regions')
            ->where('code', $regionCode)
            ->where('is_active', true)
            ->first();

        if (! $region) {
            return response()->json(['valid' => false, 'message' => 'Region not found or inactive'], 404);
        }

        $request->session()->put('region_id', $region->id);
        $request->session()->put('region_code', $region->code);

        return response()->json([
            'valid' => true,
            'region_id' => $region->id,
            'region_code' => $region->code,
            'message' => 'Region validated',
        ]);
    }

    public function validateDepo(Request $request): JsonResponse
    {
        $regionId = $request->session()->get('region_id');
        $depoCode = $request->input('depo_code');

        if (! $regionId) {
            return response()->json(['valid' => false, 'message' => 'Region not selected'], 403);
        }

        if (! $depoCode) {
            return response()->json(['valid' => false, 'message' => 'Depo code required'], 400);
        }

        $depo = \DB::table('depot_settings')
            ->where('region_id', $regionId)
            ->where('depo_code', $depoCode)
            ->first();

        if (! $depo) {
            return response()->json(['valid' => false, 'message' => 'Depo not found in selected region'], 404);
        }

        $request->session()->put('depo_id', $depo->id);
        $request->session()->put('depo_code', $depo->depo_code);

        return response()->json([
            'valid' => true,
            'depo_id' => $depo->id,
            'depo_code' => $depo->depo_code,
            'message' => 'Depo validated',
        ]);
    }

    public function loginWithContext(Request $request): JsonResponse
    {
        $regionId = $request->session()->get('region_id');
        $depoId = $request->session()->get('depo_id');

        if (! $regionId || ! $depoId) {
            return response()->json(['valid' => false, 'message' => 'Region/Depo context missing'], 403);
        }

        $validated = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = \DB::table('users')
            ->where('username', $validated['username'])
            ->where('region_id', $regionId)
            ->where('depo_id', $depoId)
            ->first();

        if (! $user || ! \Hash::check($validated['password'], $user->password)) {
            return response()->json(['valid' => false, 'message' => 'Invalid credentials or access denied for this region/depo'], 401);
        }

        $request->session()->put('user_id', $user->id);
        $request->session()->put('authenticated', true);

        return response()->json([
            'valid' => true,
            'user_id' => $user->id,
            'message' => 'Login with region/depo context successful',
        ]);
    }
}
