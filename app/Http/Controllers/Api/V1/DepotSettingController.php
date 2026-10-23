<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DepotSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DepotSettingController extends Controller
{
    /**
     * Daftar setting depo aktif. User yang di-scope ke depo hanya
     * melihat depo miliknya sendiri.
     */
    public function index(Request $request): JsonResponse
    {
        $query = DepotSetting::query()->where('is_active', true);

        if ($request->user()->isDepotScoped()) {
            $request->user()->applyDepotFilter($query, 'kode_depo');
        }

        return response()->json([
            'data' => $query->orderBy('kode_depo')->get(),
        ]);
    }

    /**
     * Setting satu depo untuk auto-fill form (asal pengirim dari depo
     * sendiri, alamat tujuan dari depo tujuan).
     */
    public function show(Request $request, string $kodeDepo): JsonResponse
    {
        $user = $request->user();

        if ($user->isDepotScoped() && ! in_array($kodeDepo, $user->depot_codes, true)) {
            abort(403, 'Anda tidak memiliki akses ke data depo ini.');
        }

        $setting = DepotSetting::query()
            ->where('kode_depo', $kodeDepo)
            ->where('is_active', true)
            ->first();

        abort_unless($setting, 404, 'Setting depo tidak ditemukan.');

        return response()->json(['data' => $setting]);
    }

    /**
     * Simpan/ubah setting satu depo. Hanya admin_master agar alamat resmi
     * depo tidak bisa diubah sembarang role (precedent: RoleController
     * membatasi permission sensitif untuk admin_master).
     */
    public function upsert(Request $request, string $kodeDepo): JsonResponse
    {
        abort_unless(
            $request->user()?->level === 'admin_master',
            403,
            'Hanya admin master yang boleh mengatur alamat depo.'
        );

        $validated = $request->validate([
            'nama_depo' => 'nullable|string|max:100',
            'nama_pengirim' => 'nullable|string|max:200',
            'alamat_pengirim' => 'nullable|string|max:2000',
            'telepon_pengirim' => 'nullable|string|max:50',
            'email_pengirim' => 'nullable|email|max:255',
            'nama_tujuan' => 'nullable|string|max:200',
            'alamat_tujuan' => 'nullable|string|max:2000',
            'telepon_tujuan' => 'nullable|string|max:50',
            'email_tujuan' => 'nullable|email|max:255',
            'npwp' => 'nullable|string|max:50',
            'logo_path' => 'nullable|string|max:255',
            'is_active' => 'nullable|boolean',
        ]);

        $setting = DepotSetting::updateOrCreate(
            ['kode_depo' => $kodeDepo],
            $validated
        );

        return response()->json([
            'message' => 'Setting depo disimpan.',
            'data' => $setting,
        ]);
    }
}
