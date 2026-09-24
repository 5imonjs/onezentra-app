<?php

namespace App\Imports;

use App\Models\Receiving;
use App\Models\RencanaKirim;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class ReceivingImport implements ToCollection, WithHeadingRow
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

            $poTransporter = trim((string) ($row['po_transporter'] ?? ''));
            $driverName = trim((string) ($row['driver_name'] ?? ''));

            if (! $poTransporter) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'PO Transporter wajib diisi'];

                continue;
            }

            try {
                $rencanaKirim = RencanaKirim::where('po_transporter', $poTransporter)->first();
                Receiving::create([
                    'rencana_kirim_id' => $rencanaKirim?->id,
                    'po_transporter' => $poTransporter,
                    'driver_name' => $driverName,
                    'status' => 'PENDING',
                    'kode_depo' => auth()->user()?->kode_depo,
                ]);
                $this->imported++;
            } catch (\Exception $e) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => $e->getMessage()];
            }
        }
    }
}
