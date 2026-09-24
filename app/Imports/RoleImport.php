<?php

namespace App\Imports;

use App\Models\Role;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class RoleImport implements ToCollection, WithHeadingRow
{
    public int $imported = 0;

    public int $updated = 0;

    public array $errors = [];

    public int $totalRows = 0;

    public function collection(Collection $rows): void
    {
        $headers = ['name', 'slug', 'description', 'is_active'];

        foreach ($rows as $index => $row) {
            $this->totalRows++;
            $rowNumber = $index + 2;

            $name = trim((string) ($row['name'] ?? ''));
            $slug = trim((string) ($row['slug'] ?? ''));
            $description = trim((string) ($row['description'] ?? ''));
            $isActive = filter_var($row['is_active'] ?? true, FILTER_VALIDATE_BOOLEAN);

            if (! $name || ! $slug) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'Nama dan slug wajib diisi'];

                continue;
            }

            $existing = Role::where('slug', strtolower($slug))->first();

            if ($existing) {
                $existing->update([
                    'name' => $name,
                    'description' => $description ?: null,
                    'is_active' => $isActive,
                ]);
                $this->updated++;

                continue;
            }

            try {
                Role::create([
                    'name' => $name,
                    'slug' => strtolower($slug),
                    'description' => $description ?: null,
                    'is_active' => $isActive,
                ]);
                $this->imported++;
            } catch (\Exception $e) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => $e->getMessage()];
            }
        }
    }
}
