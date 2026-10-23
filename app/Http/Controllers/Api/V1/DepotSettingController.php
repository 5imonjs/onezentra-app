<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DepotSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DepotSettingController extends Controller
{
    /**
     * Daftar setting depo aktif. User yang di-scope ke depo hanya
     * melihat depo miliknya sendiri.
     */
    public function index(Request $request): JsonResponse
    {
        $query = DepotSetting::query()->where('is_active', true);

        if ($request->user()->isMasterScope()) {
            // Master scope can see all depots.
        } elseif ($request->user()->scope_level === 'region' && filled($request->user()->region_id)) {
            $query->where('region_id', $request->user()->region_id);
        } else {
            $query->where('kode_depo', $request->user()->kode_depo);
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

        if (! $user->isMasterScope()) {
            $isInScope = $user->scope_level === 'region'
                ? DepotSetting::query()->where('kode_depo', $kodeDepo)->where('region_id', $user->region_id)->exists()
                : $kodeDepo === $user->kode_depo;
            abort_unless($isInScope, 403, 'Anda tidak memiliki akses ke data depo ini.');
        }

        $setting = DepotSetting::query()
            ->where('kode_depo', $kodeDepo)
            ->where('is_active', true)
            ->first();

        abort_unless($setting, 404, 'Setting depo tidak ditemukan.');

        return response()->json(['data' => $setting]);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = $request->user();
        abort_unless($actor?->canCreateDepot(), 403, 'Hanya Master atau pengguna scope Region yang boleh membuat depo.');

        $validated = $request->validate([
            'kode_depo' => 'required|string|max:20|unique:depot_settings,kode_depo',
            'nama_depo' => 'required|string|max:100',
            'region_id' => ['required', 'string', 'max:20', Rule::exists('regions', 'code')],
        ]);
        abort_if(
            $actor->scope_level === 'region' && $validated['region_id'] !== $actor->region_id,
            403,
            'Anda hanya dapat membuat depo di region Anda.'
        );

        $depot = DepotSetting::create([
            ...$validated,
            'is_active' => true,
        ]);

        return response()->json([
            'message' => 'Depo berhasil dibuat.',
            'data' => $depot,
        ], 201);
    }

    /**
     * Simpan/ubah setting satu depo. Hanya scope Master agar alamat resmi
     * depo tidak bisa diubah sembarang role (precedent: RoleController
     * membatasi permission sensitif untuk role operasional tertentu).
     */
    public function upsert(Request $request, string $kodeDepo): JsonResponse
    {
        abort_unless(
            $request->user()?->isMasterScope(),
            403,
            'Hanya scope Master yang boleh mengatur data depo.'
        );

        $validated = $request->validate([
            'nama_depo' => 'nullable|string|max:100',
            'region_id' => ['nullable', 'string', 'max:20', Rule::exists('regions', 'code')],
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
