<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BiayaThlPdfSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BiayaThlPdfSettingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $kodeDepo = $request->query('kode_depo');

        if ($kodeDepo) {
            $setting = BiayaThlPdfSetting::where('kode_depo', $kodeDepo)->first();

            return response()->json(['data' => $setting]);
        }

        $settings = BiayaThlPdfSetting::all();

        return response()->json(['data' => $settings]);
    }

    public function upsert(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'kode_depo' => 'required|string|max:10',
            'approval_sections' => 'required|array',
            'approval_sections.*.title' => 'required|string|max:100',
            'approval_sections.*.people' => 'required|array|min:1',
            'approval_sections.*.people.*.name' => 'required|string|max:150',
            'approval_sections.*.people.*.role' => 'required|string|max:50',
        ]);

        $setting = BiayaThlPdfSetting::updateOrCreate(
            ['kode_depo' => $validated['kode_depo']],
            ['approval_sections' => $validated['approval_sections']]
        );

        return response()->json(['message' => 'Settings saved', 'data' => $setting]);
    }
}
