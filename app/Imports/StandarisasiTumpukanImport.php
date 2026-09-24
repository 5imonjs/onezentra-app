<?php

namespace App\Imports;

use App\Models\Npn;
use App\Models\StandarisasiTumpukan;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class StandarisasiTumpukanImport implements ToCollection, WithHeadingRow
{
    public int $imported = 0;

    public int $updated = 0;

    public array $errors = [];

    public int $totalRows = 0;

    public function collection(Collection $rows): void
    {
        $headers = ['npn_id', 'tier', 'tinggi_tumpukan'];

        foreach ($rows as $index => $row) {
            $this->totalRows++;
            $rowNumber = $index + 2;

            $npnId = trim((string) ($row['npn_id'] ?? ''));
            $tier = trim((string) ($row['tier'] ?? '1'));
            $tinggi = trim((string) ($row['tinggi_tumpukan'] ?? '1'));

            if (! $npnId) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'NPN ID wajib diisi'];

                continue;
            }

            $npn = Npn::find($npnId);
            if (! $npn) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => 'Produk dengan ID '.$npnId.' tidak ditemukan'];

                continue;
            }

            $existing = StandarisasiTumpukan::where('npn_id', $npnId)->first();

            if ($existing) {
                $existing->update([
                    'tier' => (int) $tier,
                    'tinggi_tumpukan' => (int) $tinggi,
                ]);
                $this->updated++;

                continue;
            }

            try {
                StandarisasiTumpukan::create([
                    'npn_id' => $npnId,
                    'tier' => (int) $tier,
                    'tinggi_tumpukan' => (int) $tinggi,
                    'kode_depo' => auth()->user()?->kode_depo,
                ]);
                $this->imported++;
            } catch (\Exception $e) {
                $this->errors[] = ['row' => $rowNumber, 'errors' => $e->getMessage()];
            }
        }
    }
}
