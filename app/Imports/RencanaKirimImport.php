<?php

namespace App\Imports;

use App\Models\Npn;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\User;
use DateTimeInterface;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class RencanaKirimImport implements ToCollection, WithHeadingRow
{
    public int $totalRows = 0;

    public int $imported = 0;

    public int $skipped = 0;

    private array $headingMap = [
        'no_po_transporter' => 'po_transporter',
        'po_transporter' => 'po_transporter',
        'no_dokumen' => 'po_transporter',
        'no_po' => 'po_transporter',
        'rkh_tanggal' => 'rkh_date',
        'tanggal_rkh' => 'rkh_date',
        'rkh_date' => 'rkh_date',
        'nama_driver' => 'driver_name',
        'driver' => 'driver_name',
        'nopol' => 'nopol',
        'no_polisi' => 'nopol',
        'jenis_kendaraan' => 'jenis_kendaraan',
        'tipe_kendaraan' => 'jenis_kendaraan',
        'kendaraan' => 'jenis_kendaraan',
        'expedisi' => 'expedisi',
        'ekspedisi' => 'expedisi',
        'shipper' => 'shipper_name',
        'nama_shipper' => 'shipper_name',
        'pengirim' => 'shipper_name',
        'alamat_shipper' => 'shipper_address',
        'alamat_pengirim' => 'shipper_address',
        'telp_shipper' => 'shipper_phone',
        'telp_pengirim' => 'shipper_phone',
        'kode_depo' => 'kode_depo',
        'kode_depot' => 'kode_depo',
        'nama_depo' => 'nama_depo',
        'tujuan' => 'destination_name',
        'ditujukan' => 'destination_name',
        'alamat_tujuan' => 'destination_address',
        'catatan' => 'notes',
        'kode_barang' => 'kode_barang',
        'kode_produk' => 'kode_barang',
        'nama_barang' => 'nama_barang',
        'jumlah' => 'jumlah',
        'qty' => 'jumlah',
        'satuan' => 'satuan',
        'uom' => 'satuan',
        'keterangan' => 'keterangan',
    ];

    public function __construct(private User $user) {}

    public function collection(Collection $collection): void
    {
        $this->totalRows = $collection->count();

        // Kelompokkan baris berdasarkan No. PO Transporter: 1 rencana = 1 header + banyak item.
        $groups = [];

        foreach ($collection as $row) {
            $data = $this->parseRow($row);

            if (empty($data)) {
                $this->skipped++;

                continue;
            }

            $key = $data['po_transporter'] ?? null;

            if (blank($key)) {
                $this->skipped++;

                continue;
            }

            if (! isset($groups[$key])) {
                $groups[$key] = ['header' => [], 'items' => []];
            }

            // Header: nilai non-kosong pertama yang ditemukan di kumpulan baris.
            foreach ($data as $field => $value) {
                if (! in_array($field, ['kode_barang', 'nama_barang', 'jumlah', 'satuan', 'keterangan'], true)) {
                    if (blank($groups[$key]['header'][$field] ?? null) && ! blank($value)) {
                        $groups[$key]['header'][$field] = $value;
                    }
                }
            }

            if (! blank($data['nama_barang'] ?? null) || ! blank($data['kode_barang'] ?? null)) {
                $groups[$key]['items'][] = $data;
            }
        }

        foreach ($groups as $group) {
            $this->persistGroup($group['header'], $group['items']);
        }
    }

    private function persistGroup(array $header, array $items): void
    {
        $resolved = $this->resolveItemsFromNpn($items);
        $validItems = array_values(array_filter($resolved, fn (array $item): bool => ! blank($item['kode_barang'] ?? null)));

        if ($validItems === []) {
            $this->skipped += count($items);

            return;
        }

        $this->skipped += count($items) - count($validItems);

        $header['status'] = 'DRAFT';
        $header['created_by'] = $this->user->id;

        if (blank($header['kode_depo'] ?? null)) {
            $header = $this->user->depotAttributes($header);
        }

        $rencanaKirim = RencanaKirim::create(array_filter($header, fn ($v) => ! is_null($v)));

        $totalQty = 0;
        foreach ($validItems as $index => $item) {
            $item['rencana_kirim_id'] = $rencanaKirim->id;
            $item['item_number'] = $index + 1;
            RencanaKirimItem::create(array_filter($item, fn ($v) => ! is_null($v)));
            $totalQty += (float) $item['jumlah'];
        }

        $rencanaKirim->update(['total_qty' => $totalQty]);

        $this->imported++;
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

    private function resolveItemsFromNpn(array $items): array
    {
        return array_map(function (array $item): array {
            $product = null;

            if (! blank($item['kode_barang'] ?? null)) {
                $product = Npn::where('BOSnetszProductId', $item['kode_barang'])->first();
            }

            if (! $product && ! blank($item['nama_barang'] ?? null)) {
                $product = Npn::query()
                    ->where(function ($query) use ($item) {
                        $query->where('szNickName', $item['nama_barang'])
                            ->orWhere('szNickNameNew', $item['nama_barang']);
                    })
                    ->first();
            }

            if ($product) {
                $item['npn_id'] = $product->id;
                $item['kode_barang'] = $product->BOSnetszProductId;
                $item['nama_barang'] = $product->szNickName
                    ?: $product->szNickNameNew
                    ?: ($item['nama_barang'] ?? '');
            } else {
                // Item tidak ditemukan di NPN -> dianggap tidak valid, agar
                // konsisten dengan alur store() yang mewajibkan pencocokan NPN.
                $item['npn_id'] = null;
                $item['kode_barang'] = null;
            }

            return $item;
        }, $items);
    }

    private function cleanValue(mixed $value, string $dbKey): mixed
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($value instanceof DateTimeInterface) {
            return $dbKey === 'rkh_date' ? $value->format('Y-m-d') : $value->format('Y-m-d H:i:s');
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
