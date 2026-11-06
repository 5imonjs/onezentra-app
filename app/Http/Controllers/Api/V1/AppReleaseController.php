<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AppRelease;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

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

    /**
     * Sajikan APK rilis langsung dari server — tidak bergantung `storage:link`
     * atau konfigurasi statis web server (nginx/apache).
     */
    public function download(Request $request, int $versionCode): BinaryFileResponse
    {
        $release = AppRelease::query()
            ->forPlatform('android')
            ->published()
            ->where('version_code', $versionCode)
            ->firstOrFail();

        /** @var FilesystemAdapter $disk */
        $disk = Storage::disk('local');
        $path = $disk->path("releases/onezentra-{$versionCode}.apk");
        abort_unless(is_file($path), 404, 'File rilis tidak ditemukan.');

        return response()->file($path, [
            'Content-Type' => 'application/vnd.android.package-archive',
            'Content-Disposition' => 'attachment; filename="onezentra-'.$versionCode.'.apk"',
            // Digest sebagai header ekstra biar klien bisa verifikasi
            // sebelum memasang (selain sha256 di payload update-info).
            'SHA256' => (string) $release->sha256,
        ]);
    }
}
