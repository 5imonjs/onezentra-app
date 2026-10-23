<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DepotSetting;
use App\Models\Region;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RegionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Region::query()->orderBy('code');
        $actor = $request->user();

        if ($actor->isDepotScoped()) {
            $visibleRegionCodes = DepotSetting::query()
                ->whereIn('kode_depo', $actor->depot_codes)
                ->whereNotNull('region_id')
                ->where('region_id', '!=', '')
                ->select('region_id');
            $query->whereIn('code', $visibleRegionCodes);
        }

        return response()->json(['data' => $query->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isAdminMaster(), 403, 'Hanya admin master yang boleh membuat region.');

        $validated = $request->validate([
            'code' => 'required|string|max:20|unique:regions,code',
            'name' => 'required|string|max:100',
        ]);

        $region = Region::create($validated);

        return response()->json([
            'message' => 'Region berhasil dibuat.',
            'data' => $region,
        ], 201);
    }

    public function update(Request $request, Region $region): JsonResponse
    {
        abort_unless($request->user()?->isAdminMaster(), 403, 'Hanya admin master yang boleh mengubah region.');

        $validated = $request->validate([
            'name' => 'required|string|max:100',
        ]);
        $region->update($validated);

        return response()->json([
            'message' => 'Nama region berhasil diperbarui.',
            'data' => $region->refresh(),
        ]);
    }
}
