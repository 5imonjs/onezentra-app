<?php

namespace App\Imports;

use App\Models\Dock;
use App\Models\User;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class DockImport implements ToCollection, WithHeadingRow
{
    public int $imported = 0;

    public int $updated = 0;

    public array $errors = [];

    public int $totalRows = 0;

    public function __construct(private readonly User $user) {}

    public function collection(Collection $rows): void
    {
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

            // Lookup by-name: user depot-scoped hanya mencocokkan dock
            // depo sendiri; admin view_all mencocokkan global.
            $existing = Dock::where('name', $name)
                ->when($this->user->isDepotScoped(), fn ($query) => $this->user->applyDepotFilter($query, 'kode_depo'))
                ->first();

            // Tolak cross-depo: nama milik depo lain bukan untuk di-update,
            // supaya import tidak memindahkan/menimpa dock depo lain.
            if (! $existing && $this->user->isDepotScoped()) {
                $foreign = Dock::where('name', $name)->first();
                if ($foreign) {
                    $this->errors[] = ['row' => $rowNumber, 'errors' => "Dock '{$name}' sudah dipakai di depo lain."];

                    continue;
                }
            }

            if ($existing) {
                $existing->update([
                    'code' => $code ?: null,
                    'capacity' => $capacity ? (int) $capacity : null,
                ]);
                $this->updated++;

                continue;
            }

            try {
                Dock::create($this->user->depotAttributes([
                    'name' => $name,
                    'code' => $code ?: null,
                    'capacity' => $capacity ? (int) $capacity : null,
                    'status' => 'AVAILABLE',
                ]));
                $this->imported++;
            } catch (\Exception $e) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => $e->getMessage()];
            }
        }
    }
}
