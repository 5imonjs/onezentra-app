<?php

namespace App\Imports;

use App\Models\BiayaRetribusi;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class BiayaRetribusiImport implements ToCollection, WithHeadingRow
{
    public int $imported = 0;

    public int $updated = 0;

    public array $errors = [];

    public int $totalRows = 0;

    public function collection(Collection $rows): void
    {
        foreach ($rows as $index => $row) {
            $this->totalRows++;
            $rowNumber = $index + 2;

            $noSuratJalan = trim((string) ($row['no_surat_jalan'] ?? ''));
            $nopol = trim((string) ($row['nopol_kendaraan'] ?? ''));

            if (! $noSuratJalan) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'No. Surat Jalan wajib diisi'];

                continue;
            }

            try {
                BiayaRetribusi::create([
                    'no_surat_jalan' => $noSuratJalan,
                    'nopol_kendaraan' => $nopol,
                    'tanggal_pengajuan' => now(),
                    'kode_depo' => auth()->user()?->kode_depo,
                    'nama_depo' => auth()->user()?->nama_depo,
                    'status' => 'draft',
                ]);
                $this->imported++;
            } catch (\Exception $e) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => $e->getMessage()];
            }
        }
    }
}
