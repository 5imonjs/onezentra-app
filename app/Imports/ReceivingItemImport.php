<?php

namespace App\Imports;

use App\Models\Npn;
use App\Models\ReceivingItem;
use App\Models\User;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;
use Maatwebsite\Excel\Concerns\WithValidation;
use PhpOffice\PhpSpreadsheet\Shared\Date;

class ReceivingItemImport implements ToCollection, WithHeadingRow, WithValidation
{
    public int $imported = 0;

    public int $skipped = 0;

    public array $errors = [];

    public function __construct(private User $user) {}

    public function collection(Collection $collection): void
    {
        $handled = [];

        foreach ($collection as $row) {
            $kode = $this->text($row['kode_barang'] ?? null);
            $namaBarang = $this->text($row['nama_barang'] ?? null);
            $qtyCrt = $this->number($row['qty_crt_zak'] ?? $row['qty_crt'] ?? null);
            $qtyPcs = $this->number($row['qty_pcs'] ?? null);
            $expired = $this->date($row['tgl_expired_date'] ?? $row['expired_date'] ?? null);
            $tanggalTerima = $this->date($row['tgl_penerimaan'] ?? null);
            $sumber = $this->text($row['sumber_material'] ?? null);
            $kodeDepo = $this->text($row['kode_depo'] ?? null);
            $namaDepo = $this->text($row['nama_depo'] ?? null);
            $satuan = $this->text($row['satuan'] ?? null);

            if ($kode === null || $qtyCrt === null || $expired === null) {
                $this->skipped++;

                continue;
            }

            $key = implode('|', [$kode, $satuan, $expired]);
            if (isset($handled[$key])) {
                continue;
            }
            $handled[$key] = true;

            $npn = Npn::query()
                ->where(fn ($q) => $q
                    ->where('BOSnetszProductId', $kode)
                    ->orWhere('SAPszProductId', $kode)
                    ->orWhere('szBarcode', $kode))
                ->first();

            $conversion = $npn?->pcConversion();
            $baseUom = $satuan
                ?? $npn?->stagingUom()
                ?? 'CRT';
            $qtyPcs ??= ($conversion !== null && $qtyCrt !== null)
                ? $qtyCrt * $conversion
                : null;

            $attributes = [
                'source' => ReceivingItem::SOURCE_IMPORT,
                'kode_barang' => $kode,
                'nama_barang' => $namaBarang ?? $npn?->szNickName ?? $kode,
                'actual_qty' => $qtyCrt,
                'expected_qty' => $qtyCrt,
                'qty_pcs' => $qtyPcs,
                'satuan' => $baseUom,
                'conversion_factor' => $conversion !== null ? (float) $conversion : null,
                'expired_date' => $expired,
                'tanggal_penerimaan' => $tanggalTerima,
                'sumber_material' => $sumber,
                'condition' => ReceivingItem::CONDITIONS[0],
                'scanned_by' => $this->user->id,
                'scan_time' => now(),
            ];

            $attributes = $this->user->depotAttributes($attributes);
            $attributes['kode_depo'] ??= $kodeDepo;
            $attributes['nama_depo'] ??= $namaDepo;

            ReceivingItem::create($attributes);
            $this->imported++;
        }
    }

    public function rules(): array
    {
        return [
            'kode_barang' => ['required'],
            'qty_crt_zak' => ['required', 'numeric', 'min:0'],
            'qty_pcs' => ['nullable', 'numeric', 'min:0'],
            'tgl_expired_date' => ['required'],
        ];
    }

    private function text(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        return trim((string) $value);
    }

    private function number(mixed $value): ?float
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        $normalized = str_replace([',', ' '], '', (string) $value);

        return is_numeric($normalized) ? (float) $normalized : null;
    }

    private function date(mixed $value): ?string
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        try {
            $parsed = is_numeric($value)
                ? Date::excelToDateTimeObject((float) $value)
                : new \DateTime((string) $value);

            return $parsed->format('Y-m-d');
        } catch (\Exception) {
            return (string) $value;
        }
    }
}
