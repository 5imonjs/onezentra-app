<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppRelease;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pembaruan aplikasi mobile tanpa store: satu-satunya endpoint publik yang
 * boleh dibaca tanpa login. Tidak menyebarkan apa pun kecuali katalog
 * rilis (versi, URL APK, sha256) — tidak berisi data operasional.
 */
class AppReleaseController extends Controller
{
    public function latest(Request $request): JsonResponse
    {
        $platform = (string) $request->query('platform', 'android');

        // Rilis tertinggi yang sudah dipublikasikan.
        $latest = AppRelease::query()
            ->forPlatform($platform)
            ->published()
            ->orderByDesc('version_code')
            ->first();

        // Min supported tertinggi di seluruh rilis — membuat angka
        // penjaga tetap benar meski rilis tertinggi tidak dipaksa.
        $minSupported = AppRelease::query()
            ->forPlatform($platform)
            ->published()
            ->max('min_supported_code') ?? 0;

        return response()->json([
            'release' => $latest?->only([
                'version_name',
                'version_code',
                'min_supported_code',
                'apk_url',
                'sha256',
                'notes',
                'force',
            ]),
            'min_supported_code' => (int) $minSupported,
        ]);
    }
}
