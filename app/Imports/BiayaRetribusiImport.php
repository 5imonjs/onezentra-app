<?php

namespace App\Imports;

use App\Models\BiayaRetribusi;
use App\Models\DepotSetting;
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
            $typeKendaraan = trim((string) ($row['type_kendaraan'] ?? ''));
            $nominal = $row['nominal_biaya'] ?? null;

            // Kolom wajib: tanpa ini baris tidak bisa menjadi detail valid.
            if (! $noSuratJalan) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'No. Surat Jalan wajib diisi'];

                continue;
            }

            if (! $nopol) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'Nopol Kendaraan wajib diisi'];

                continue;
            }

            if ($nominal === null || $nominal === '' || ! is_numeric($nominal) || (float) $nominal < 0) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'Nominal Biaya wajib diisi (angka >= 0)'];

                continue;
            }

            $user = auth()->user();
            $kodeDepo = $user?->depot_codes[0] ?? $user?->kode_depo;
            if (blank($kodeDepo)) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'Kode depo tidak ditemukan — header tanpa kode_depo tidak dibuat'];

                continue;
            }
            $namaDepo = DepotSetting::where('kode_depo', $kodeDepo)->value('nama_depo') ?? $user?->nama_depo;

            try {
                // Header selalu dibuat bersama minimal 1 detail valid —
                // header tanpa detail hanya menjadi baris yatim Rp0.
                $header = BiayaRetribusi::create([
                    'tanggal_pengajuan' => now(),
                    'kode_depo' => $kodeDepo,
                    'nama_depo' => $namaDepo,
                    'nominal_biaya' => (float) $nominal,
                    'created_by' => $user?->id,
                    'status' => 'draft',
                ]);
                $header->details()->create([
                    'no_surat_jalan' => $noSuratJalan,
                    'nopol_kendaraan' => strtoupper($nopol),
                    'type_kendaraan' => $typeKendaraan ? strtoupper($typeKendaraan) : null,
                    'nominal_biaya' => (float) $nominal,
                    'order' => 0,
                ]);
                $this->imported++;
            } catch (\Exception $e) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => $e->getMessage()];
            }
        }
    }
}
