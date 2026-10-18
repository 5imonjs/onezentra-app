<?php

namespace App\Services\Biaya;

use Carbon\Carbon;
use Dompdf\Dompdf;
use Illuminate\Http\Response;

/**
 * Render PDF biaya (THL & Retribusi) via Dompdf + utilitas nama file/logo.
 * Menyatukan boilerplate Dompdf (opsi, limit waktu/memori, header respons)
 * yang sebelumnya digandakan di dua controller.
 */
class BiayaPdfRenderer
{
    /**
     * Nama file unduhan seragam: `DD-MM-YYYY_{$kind}.{$ext}`.
     * Tanggal dari tanggal pengajuan; bila tak valid, pakai hari ini.
     */
    public function downloadFilename(string $kind, mixed $tanggal, string $ext): string
    {
        try {
            $date = Carbon::parse((string) ($tanggal ?: now()))->format('d-m-Y');
        } catch (\Throwable) {
            $date = now()->format('d-m-Y');
        }

        return "{$date}_{$kind}.{$ext}";
    }

    /**
     * Logo PDF sebagai data URI base64, null bila file tak ada.
     */
    public function logoData(string $file = 'biaya_thl.jpeg'): ?string
    {
        $logoPath = public_path($file);

        if (! is_file($logoPath)) {
            return null;
        }

        return base64_encode((string) file_get_contents($logoPath));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function render(string $view, array $data, string $filename): Response
    {
        $html = view($view, $data)->render();

        $dompdf = new Dompdf;
        $dompdf->set_option('isRemoteEnabled', true);
        $dompdf->set_option('defaultFont', 'DejaVu Sans');
        $dompdf->set_option('tempDir', sys_get_temp_dir());
        $dompdf->loadHtml($html);
        $dompdf->setPaper('A4', 'landscape');

        $previousTimeLimit = ini_get('max_execution_time');
        $previousMemoryLimit = ini_get('memory_limit');
        set_time_limit(300);
        ini_set('memory_limit', '512M');

        $dompdf->render();

        if ($previousTimeLimit !== false) {
            set_time_limit((int) $previousTimeLimit);
        }
        ini_set('memory_limit', $previousMemoryLimit);

        return response($dompdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="'.$filename.'"',
        ]);
    }
}
