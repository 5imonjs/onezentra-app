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

        return $process->successful() && file_exists($outputPath);
    }
}
