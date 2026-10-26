<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

#[Signature('evidence:migrate {--apply : Pindahkan file dan hapus symlink public/storage} {--confirm= : Isi MIGRATE EVIDENCE untuk mengaktifkan --apply}')]
#[Description('Pindahkan bukti lama dari storage/app/public ke root privat dan lepas symlink publiknya')]
class EvidenceMigrate extends Command
{
    public function handle(): int
    {
        $legacy = Storage::disk('public_legacy');
        $primary = Storage::disk('public');
        $files = collect($legacy->allFiles())
            ->reject(fn (string $path): bool => in_array(basename($path), ['.gitignore', '.gitkeep'], true))
            ->values();
        $link = public_path('storage');

        $this->info('File lama: '.$files->count().' file.');
        $this->line('Symlink public/storage: '.(is_link($link) ? 'ada -> '.readlink($link) : 'tidak ada'));

        if (! $this->option('apply')) {
            $this->line('Dry-run. Tidak ada file yang dipindahkan.');
            $this->line('Untuk menerapkan: --apply --confirm="MIGRATE EVIDENCE" setelah backup.');

            return self::SUCCESS;
        }

        if ($this->option('confirm') !== 'MIGRATE EVIDENCE') {
            $this->error('Konfirmasi tidak cocok. Gunakan --confirm="MIGRATE EVIDENCE".');

            return self::FAILURE;
        }

        $moved = 0;
        foreach ($files as $path) {
            $stream = $legacy->readStream($path);
            if ($stream === null) {
                $this->warn("Lewati (tidak bisa dibaca): {$path}");

                continue;
            }

            try {
                $primary->writeStream($path, $stream);
            } finally {
                if (is_resource($stream)) {
                    fclose($stream);
                }
            }

            if (! $primary->exists($path)) {
                $this->error("Gagal menyalin: {$path}");

                return self::FAILURE;
            }

            $legacy->delete($path);
            $moved++;
        }

        // Jangan hapus direktori/symlink nyata yang bukan symlink storage.
        // Test tidak boleh menyentuh symlink dev yang asli.
        if (! app()->environment('testing') && is_link($link)) {
            $target = realpath($link);
            $allowed = realpath(storage_path('app/public'));
            if ($target !== false && $allowed !== false && str_starts_with($target, $allowed)) {
                unlink($link);
                $this->line('Symlink public/storage dilepas.');
            } else {
                $this->warn('public/storage bukan symlink ke storage/app/public; tidak dihapus.');
            }
        }

        $this->info($moved.' file dipindahkan ke storage/app/private/evidence.');

        return self::SUCCESS;
    }
}
