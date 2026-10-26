<?php

namespace App\Support;

use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Pusat akses file bukti (foto validasi, dokumen biaya).
 *
 * Disk `public` sekarang ber-root privat. File lama dari
 * storage/app/public tetap dibaca lewat disk `public_legacy` sampai
 * `php artisan evidence:migrate --apply` dijalankan. Jangan akses
 * Storage::disk('public') langsung dari controller baru: gunakan helper ini
 * agar fallback file lama tetap konsisten.
 */
class EvidenceStorage
{
    public const DISK = 'public';

    public const LEGACY_DISK = 'public_legacy';

    public static function putFile(UploadedFile $file, string $directory): string
    {
        $path = $file->store($directory, self::DISK);

        if (! is_string($path) || $path === '') {
            throw new \RuntimeException('Gagal menyimpan file bukti.');
        }

        return $path;
    }

    public static function put(string $path, string $contents): void
    {
        if (! Storage::disk(self::DISK)->put($path, $contents)) {
            throw new \RuntimeException('Gagal menulis file bukti.');
        }
    }

    public static function exists(string $path): bool
    {
        if ($path === '') {
            return false;
        }

        if (Storage::disk(self::DISK)->exists($path)) {
            return true;
        }

        return self::legacyDisk()?->exists($path) ?? false;
    }

    /**
     * Disk yang benar-benar memiliki file. Utamakan disk privat; fallback ke
     * root lama hanya untuk data yang belum dimigrasikan.
     */
    public static function diskFor(string $path): ?FilesystemAdapter
    {
        if ($path === '') {
            return null;
        }

        $primary = Storage::disk(self::DISK);
        if ($primary->exists($path)) {
            return $primary;
        }

        $legacy = self::legacyDisk();
        if ($legacy?->exists($path)) {
            return $legacy;
        }

        return null;
    }

    public static function delete(string $path): void
    {
        if ($path === '') {
            return;
        }

        Storage::disk(self::DISK)->delete($path);
        self::legacyDisk()?->delete($path);
    }

    /**
     * Path absolut untuk response()->file(); null bila file tidak ada.
     */
    public static function path(string $path): ?string
    {
        return self::diskFor($path)?->path($path);
    }

    private static function legacyDisk(): ?FilesystemAdapter
    {
        // Test memakai Storage::fake('public'); jangan biarkan file dev nyata
        // di storage/app/public memengaruhi hasil test.
        if (app()->environment('testing')) {
            return null;
        }

        return Storage::disk(self::LEGACY_DISK);
    }
}
