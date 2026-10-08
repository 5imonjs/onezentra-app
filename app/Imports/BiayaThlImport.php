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

            $kodeDepo = auth()->user()?->kode_depo;
            if (blank($kodeDepo)) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'Kode depo tidak ditemukan — header tanpa kode_depo tidak dibuat'];

                continue;
            }

            try {
                // Header selalu dibuat bersama minimal 1 detail valid —
                // header tanpa detail hanya menjadi baris mati yang tak bisa
                // disubmit (assertSubmittable menolak details kosong).
                // created_by dicatat agar audit konsisten dengan store().
                $user = auth()->user();
                $header = BiayaThl::create([
                    'no_surat_jalan' => $noSuratJalan,
                    'tanggal_pengajuan' => now(),
                    'kode_depo' => $kodeDepo,
                    'nama_depo' => $user?->nama_depo,
                    'created_by' => $user?->id,
                    'status' => 'draft',
                ]);
                $header->details()->create([
                    'no_surat_jalan' => $noSuratJalan,
                    'nama_thl' => $namaThl,
                    'order' => 0,
                ]);
                $this->imported++;
            } catch (\Exception $e) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => $e->getMessage()];
            }
        }
    }
}
