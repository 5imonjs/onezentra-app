<?php

namespace App\Helpers;

use Illuminate\Support\Facades\Process;

class PdfCompressor
{
    public static function compress(string $inputPath, string $outputPath): bool
    {
        if (file_exists($outputPath)) {
            unlink($outputPath);
        }

        // `qpdf` tidak selalu terpasang (Hostinger shared hosting sering tanpa
        // binary ini). Process::run melempar sebelum mengembalikan result bila
        // executable tidak ada — jangan sampai import gagal 500 hanya karena
        // kompresi opsional.
        try {
            $process = Process::run([
                'qpdf',
                '--compress-streams=y',
                '--linearize',
                $inputPath,
                $outputPath,
            ]);
        } catch (\Throwable $e) {
            \Log::warning('qpdf tidak tersedia; PDF disimpan tanpa kompresi', [
                'error' => $e->getMessage(),
            ]);

            return false;
        }

        if (! $process->successful() || ! file_exists($outputPath)) {
            \Log::warning('qpdf gagal mengompres PDF; file disimpan tanpa kompresi', [
                'error' => $process->errorOutput(),
            ]);

            return false;
        }

        return true;
    }
}
