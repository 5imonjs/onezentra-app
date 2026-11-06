<?php

namespace App\Console\Commands;

use App\Models\AppRelease;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Publikasikan APK mobile baru tanpa store: salin file ke disk internal
 * (di luar public/), hitung sha256, daftarkan rilis; APK disajikan lewat
 * route /api/v1/releases/{versionCode}. Dipanggil setelah build release
 * dibuat (`flutter build apk --release`).
 *
 * Contoh:
 *   php artisan app:release-apk build/app/outputs/flutter-apk/app-release.apk \
 *       --version-name=1.0.2 --version-code=2 --min-supported-code=1 \
 *       --notes="Perbaikan scan & tanggal expired" [--force]
 */
#[Signature('app:release-apk {apk : Path ke file APK} {--platform=android} {--version-name= : Nama versi tampilan (mis. 1.0.2)} {--version-code= : Build number integer} {--min-supported-code=0 : Build number paling lama yang tetap boleh berjalan} {--force : Paksa update walau min_supported tidak tercapai} {--notes= : Catatan rilis}')]
#[Description('Publikasikan APK sebagai rilis app mobile (tanpa store)')]
class PublishAppRelease extends Command
{
    public function handle(): int
    {
        $apkPath = (string) $this->argument('apk');
        if (! is_file($apkPath)) {
            $this->error("File APK tidak ditemukan: {$apkPath}");

            return self::FAILURE;
        }

        // Auto-isi version_name/version_code dari nama file bila tidak diberikan
        // sangat tidak aman (salah alias); menuntut eksplisit mencegah salah rilis.
        $versionName = $this->option('version-name');
        $versionCode = $this->option('version-code');
        if (! $versionName || ! $versionCode) {
            $this->error('--version-name dan --version-code wajib diisi eksplisit.');

            return self::FAILURE;
        }
        $versionCode = (int) $versionCode;
        if ($versionCode <= 0) {
            $this->error('--version-code harus positif.');

            return self::FAILURE;
        }

        // Nama file stabil: releases/onezentra-<code>.apk pada disk local
        // (storage/app) — disajikan lewat route download, bukan public/.
        $destination = "releases/onezentra-{$versionCode}.apk";
        $stream = fopen($apkPath, 'rb');
        Storage::disk('local')->put($destination, $stream);
        fclose($stream);

        $apkUrl = route('api.releases.download', ['versionCode' => $versionCode]);
        $sha256 = hash_file('sha256', $apkPath);

        $release = AppRelease::query()->updateOrCreate(
            [
                'platform' => (string) $this->option('platform'),
                'version_code' => $versionCode,
            ],
            [
                'version_name' => (string) $versionName,
                'min_supported_code' => (int) $this->option('min-supported-code'),
                'apk_url' => $apkUrl,
                'sha256' => $sha256,
                'notes' => $this->option('notes'),
                'force' => (bool) $this->option('force'),
                'published_at' => now(),
            ],
        );

        $this->info("Rilis {$release->version_name} (code {$release->version_code}) terdaftar.");
        $this->line("URL    : {$release->apk_url}");
        $this->line("SHA256 : {$release->sha256}");
        $this->line("Min supported code: {$release->min_supported_code}");

        return self::SUCCESS;
    }
}
