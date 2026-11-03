<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class RegionDepoValidationController
{
    public function validateRegion(Request $request): JsonResponse
    {
        $regionCode = $request->input('region_code');

        if (! $regionCode) {
            return response()->json(['valid' => false, 'message' => 'Region code required'], 400);
        }

        $region = DB::table('regions')
            ->where('code', $regionCode)
            ->where('is_active', true)
            ->first();

        if (! $region) {
            return response()->json(['valid' => false, 'message' => 'Region not found or inactive'], 404);
        }

        // Konteks mengikuti kunci bisnis (kode region), bukan surrogate id:
        // tabel regions memakai `code` sebagai primary key dan scoping
        // operasional (users.region_id, depot_settings.region_id) juga
        // menyimpan kode tersebut.
        $request->session()->put([
            'region_id' => $region->code,
            'region_code' => $region->code,
            'region_name' => $region->name,
        ]);

        // Region berubah → konteks depo lama harus dibuang agar tidak
        // mencampur depo lintas region.
        $request->session()->forget(['depo_id', 'kode_depo', 'depo_nama']);

        return response()->json([
            'valid' => true,
            'region_id' => $region->code,
            'region_code' => $region->code,
            'region_name' => $region->name,
            'message' => 'Region validated',
        ]);
    }

    /**
     * Daftar depo aktif untuk region yang dipilih pada session server.
     */
    public function depoOptions(Request $request): JsonResponse
    {
        $regionCode = $request->session()->get('region_code');

        if (! $regionCode) {
            return response()->json(['valid' => false, 'message' => 'Region not selected'], 403);
        }

        $depos = DB::table('depot_settings')
            ->where('region_id', $regionCode)
            ->where('is_active', true)
            ->orderBy('kode_depo')
            ->get(['id', 'kode_depo', 'nama_depo']);

        return response()->json([
            'valid' => true,
            'region_code' => $regionCode,
            'region_name' => $request->session()->get('region_name'),
            'depos' => $depos,
        ]);
    }

    public function validateDepo(Request $request): JsonResponse
    {
        $regionCode = $request->session()->get('region_code');

        if (! $regionCode) {
            return response()->json(['valid' => false, 'message' => 'Region not selected'], 403);
        }

        $kodeDepo = $request->input('kode_depo');

        if (! $kodeDepo) {
            return response()->json(['valid' => false, 'message' => 'Depo code required'], 400);
        }

        $depo = DB::table('depot_settings')
            ->where('region_id', $regionCode)
            ->where('kode_depo', $kodeDepo)
            ->where('is_active', true)
            ->first();

        if (! $depo) {
            return response()->json(['valid' => false, 'message' => 'Depo not found in selected region'], 404);
        }

        $request->session()->put([
            'depo_id' => (int) $depo->id,
            'kode_depo' => $depo->kode_depo,
            'depo_nama' => $depo->nama_depo,
        ]);

        return response()->json([
            'valid' => true,
            'depo_id' => (int) $depo->id,
            'kode_depo' => $depo->kode_depo,
            'depo_name' => $depo->nama_depo,
            'message' => 'Depo validated',
        ]);
    }

    public function loginWithContext(Request $request): JsonResponse
    {
        $regionCode = $request->session()->get('region_id');
        $depoId = $request->session()->get('depo_id');

        if (! $regionCode || ! $depoId) {
            return response()->json(['valid' => false, 'message' => 'Region/Depo context missing'], 403);
        }

        $validated = $request->validate([
            'email' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $validated['email'])
            ->where('region_id', $regionCode)
            ->first();

        if (! $user || ! Hash::check($validated['password'], $user->password)) {
            // 422 + pesan pada key "email" agar konsisten dengan penolakan
            // login biasa ( pesan tidak membocorkan mana yang salah).
            throw ValidationException::withMessages([
                'email' => ['Invalid credentials or access denied for this region/depo'],
            ]);
        }

        $isMaster = $user->isMasterScope();

        if (! $isMaster && (int) $user->depo_id !== (int) $depoId) {
            return response()->json(['valid' => false, 'message' => 'Access denied for this region/depo'], 403);
        }

        if ($request->hasSession()) {
            Auth::login($user);
            $request->session()->regenerate();
        }

        return response()->json([
            'valid' => true,
            'user' => $user,
            'user_id' => $user->id,
            'permissions' => $user->getAssignedPermissionSlugs(),
            'message' => 'Login with region/depo context successful',
        ]);
    }
}
