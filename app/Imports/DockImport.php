<?php

namespace App\Imports;

use App\Models\Dock;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class DockImport implements ToCollection, WithHeadingRow
{
    public int $imported = 0;

    public int $updated = 0;

    public array $errors = [];

    public int $totalRows = 0;

    public function collection(Collection $rows): void
    {
        $headers = ['name', 'code', 'capacity'];

        foreach ($rows as $index => $row) {
            $this->totalRows++;
            $rowNumber = $index + 2;

            $name = trim((string) ($row['name'] ?? ''));
            $code = trim((string) ($row['code'] ?? ''));
            $capacity = trim((string) ($row['capacity'] ?? ''));

            if (! $name) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'Nama wajib diisi'];

                continue;
            }

            $existing = Dock::where('name', $name)->first();

            if ($existing) {
                $existing->update([
                    'code' => $code ?: null,
                    'capacity' => $capacity ? (int) $capacity : null,
                ]);
                $this->updated++;

                continue;
            }

            try {
                Dock::create([
                    'name' => $name,
                    'code' => $code ?: null,
                    'capacity' => $capacity ? (int) $capacity : null,
                    'status' => 'AVAILABLE',
                    'kode_depo' => auth()->user()?->kode_depo,
                    'nama_depo' => auth()->user()?->nama_depo,
                ]);
                $this->imported++;
            } catch (\Exception $e) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => $e->getMessage()];
            }
        }
    }
}
