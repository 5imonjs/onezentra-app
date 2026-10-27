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

        $process = Process::run([
            'qpdf',
            '--compress-streams=y',
            '--linearize',
            $inputPath,
            $outputPath,
        ]);

        if (! $process->successful() || ! file_exists($outputPath)) {
            \Log::warning('qpdf gagal mengompres PDF; file disimpan tanpa kompresi', [
                'error' => $process->errorOutput(),
            ]);

            return false;
        }

        return true;
    }
}
