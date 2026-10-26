<?php

namespace App\Imports;

use App\Models\Npn;
use App\Models\StandarUmurProduk;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class RencanaKirimItemImport implements ToCollection, WithHeadingRow
{
    public int $totalRows = 0;

    public int $matched = 0;

    public int $skipped = 0;

    public array $items = [];

    private array $headingMap = [
        'kode_barang' => 'kode_barang',
        'kode_produk' => 'kode_barang',
        'nama_barang' => 'nama_barang',
        'jumlah' => 'jumlah',
        'qty' => 'jumlah',
        'satuan' => 'satuan',
        'uom' => 'satuan',
        'keterangan' => 'keterangan',
    ];

    public function collection(Collection $collection): void
    {
        $this->totalRows = $collection->count();

        foreach ($collection as $row) {
            $data = $this->parseRow($row);

            if ($data === []) {
                $this->skipped++;

                continue;
            }

            $resolved = $this->resolveFromNpn($data);

            if ($resolved !== null) {
                $this->items[] = $resolved;
                $this->matched++;
            } else {
                $this->skipped++;
            }
        }
    }

    private function parseRow(Collection|array $row): array
    {
        $data = [];

        foreach ($row as $key => $value) {
            if (! is_string($key)) {
                continue;
            }

            $dbKey = $this->headingMap[$key] ?? null;

            if ($dbKey === null) {
                $normalized = $this->normalizeKey($key);
                foreach ($this->headingMap as $mapKey => $mapValue) {
                    if ($this->normalizeKey($mapKey) === $normalized) {
                        $dbKey = $mapValue;
                        break;
                    }
                }
            }

            if ($dbKey === null) {
                continue;
            }

            $value = $this->cleanValue($value, $dbKey);

            if (is_null($value) || $value === '') {
                continue;
            }

            $data[$dbKey] = $value;
        }

        return $data;
    }

    private function resolveFromNpn(array $item): ?array
    {
        $product = null;

        if (! blank($item['kode_barang'] ?? null)) {
            $product = Npn::where('BOSnetszProductId', $item['kode_barang'])->first();
        }

        if (! $product && ! blank($item['nama_barang'] ?? null)) {
            $product = Npn::query()
                ->where(function ($query) use ($item) {
                    $query->where('szNickName', $item['nama_barang'])
                        ->orWhere('szNickNameNew', $item['nama_barang'])
                        ->orWhere('szShortDescription', $item['nama_barang']);
                })
                ->first();
        }

        if (! $product) {
            return null;
        }

        // Umur diambil dari standar_umur_produk via SAPszProductId -> material (sama seperti NpnController::searchProduct dan RencanaKirimController::attachStandarUmur)
        $umur = null;
        if (! blank($product->SAPszProductId)) {
            $umur = StandarUmurProduk::where('material', $product->SAPszProductId)->value('umur');
        }

        return [
            'npn_id' => $product->id,
            'kode_barang' => $product->BOSnetszProductId,
            'nama_barang' => $product->szNickName
                ?: $product->szNickNameNew
                ?: $product->szShortDescription
                ?: ($item['nama_barang'] ?? ''),
            'jumlah' => $item['jumlah'] ?? 0,
            'satuan' => $item['satuan'] ?? 'CRT',
            'keterangan' => $item['keterangan'] ?? '',
            'umur' => $umur !== null ? (int) $umur : null,
            'decVolume' => $product->decVolume !== null ? (float) $product->decVolume : null,
            'SAPdecUom' => $product->SAPdecUom !== null ? (int) $product->SAPdecUom : null,
        ];
    }

    private function cleanValue(mixed $value, string $dbKey): mixed
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_string($value)) {
            $value = trim($value);

            if ($value === '' || str_starts_with($value, '=')) {
                return null;
            }

            if ($dbKey === 'jumlah') {
                return (float) $value;
            }

            return $value;
        }

        if ($dbKey === 'jumlah') {
            return (float) $value;
        }

        return $value;
    }

    private function normalizeKey(string $key): string
    {
        return preg_replace('/[^a-z0-9]/', '', strtolower($key));
    }
}
