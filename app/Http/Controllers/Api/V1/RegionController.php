<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Region;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RegionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Region::query()->orderBy('code');
        $actor = $request->user();

        if ($actor->isMasterScope()) {
            // Master scope can manage the full hierarchy.
        } elseif (filled($actor->region_id)) {
            $query->where('code', $actor->region_id);
        } else {
            $query->whereRaw('1 = 0');
        }

        return response()->json(['data' => $query->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->isMasterScope(), 403, 'Hanya pengguna scope Master yang boleh membuat region.');

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
        abort_unless($request->user()?->isMasterScope(), 403, 'Hanya pengguna scope Master yang boleh mengubah region.');

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
