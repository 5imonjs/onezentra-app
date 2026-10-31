<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class RegionDepoValidationController extends Controller
{
    public function validateRegion(Request $request)
    {
        $regionCode = $request->input('region_code');
        $port = $request->input('port');

        // Basic validation — extend with DB lookup for regions table
        if (! $regionCode || strlen($regionCode) < 3) {
            return response()->json(['valid' => false, 'message' => 'Region code required'], 400);
        }

        // In production, check DB: SELECT * FROM regions WHERE code = ? AND is_active = 1
        $region = \DB::table('regions')
            ->where('code', $regionCode)
            ->where('is_active', 1)
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

    public function validateDepo(Request $request)
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

    public function loginWithContext(Request $request)
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

        // Integrate with existing auth logic; add region/depo scope to user query
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
            'region_id' => $regionId,
            'depo_id' => $depoId,
            'message' => 'Login successful with region/depo context',
        ]);
    }
}

---

## 6. Controller & Auth Integration (Fase 3 — Siap Deploy)

`App\Http\Controllers\RegionDepoValidationController`
- `validateRegion`: cek `regions` DB, simpan `region_id` ke session
- `validateDepo`: cek `depot_settings` dalam `region_id` session, simpan `depo_id`
- `loginWithContext`: validasi `username` + `password` dengan scope `region_id` + `depo_id`

File siap di-deploy ke `/var/www/onezentra/app/Http/Controllers/RegionDepoValidationController.php`

---
*Fase 1-7 sudah berjalan. Fase 6 (UI Gateway) sudah dibuat. Middleware `ScopeRegionDepo` siap. Controller siap. Tidak ada data/konfigurasi produksi yang rusak.*
