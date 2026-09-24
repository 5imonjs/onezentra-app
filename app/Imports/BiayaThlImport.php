<?php

namespace App\Imports;

use App\Models\BiayaThl;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class BiayaThlImport implements ToCollection, WithHeadingRow
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
            $namaThl = trim((string) ($row['nama_thl'] ?? ''));

            if (! $noSuratJalan || ! $namaThl) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'No. Surat Jalan dan Nama THL wajib diisi'];

                continue;
            }

            try {
                BiayaThl::create([
                    'no_surat_jalan' => $noSuratJalan,
                    'nama_thl' => $namaThl,
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
