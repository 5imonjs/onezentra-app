<?php

namespace App\Imports;

use App\Models\StandarUmurProduk;
use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\ToCollection;
use Maatwebsite\Excel\Concerns\WithHeadingRow;

class StandarUmurProdukImport implements ToCollection, WithHeadingRow
{
    public int $totalRows = 0;

    public int $imported = 0;

    public int $skipped = 0;

    /**
     * Kunci = slug kanonis heading template (Str::slug($heading, '_'),
     * sama persis dengan yang dihasilkan WithHeadingRow).
     * Alias lawas (sku, sku_name, company) dipertahankan untuk file lama.
     */
    private array $headingMap = [
        'material' => 'material',
        'material_description' => 'material_description',
        'old_material_number' => 'old_material_number',
        'ext_material_group' => 'ext_material_group',
        'country' => 'country',
        'principal' => 'principal',
        'cluster' => 'cluster',
        'cluster2' => 'cluster2',
        'lob' => 'lob',
        'category' => 'category',
        'sub_category' => 'sub_category',
        'brand' => 'brand',
        'incubation' => 'incubation',
        'isi_sap' => 'isi_sap',
        'isi_bosnet' => 'isi_bosnet',
        'conversion1' => 'conversion1',
        'conversion2' => 'conversion2',
        'mindoi' => 'min_doi',
        'targetdoi' => 'target_doi',
        'maxdoi' => 'max_doi',
        'trigger_point' => 'trigger_point',
        'max_point' => 'max_point',
        'supply_pattern' => 'supply_pattern',
        'demand_pattern' => 'demand_pattern',
        'skugrp' => 'skugrp',
        'skuconv' => 'skuconv',
        'umur' => 'umur',
        'vol_m3' => 'vol_m3',
        'weight_kg' => 'weight_kg',
        'metricton' => 'metric_ton',
        'typesku' => 'type_sku',
        'uom' => 'uom',
        'allocation_start' => 'allocation_start',
        'allocation_end' => 'allocation_end',
        'uom2' => 'uom2',
        'skustatus' => 'sku_status',
        'madein' => 'made_in',
        'supplier_productid' => 'product_id',
        'nickname' => 'nickname',
        'sku_fokus_nka' => 'sku_fokus_nka',
        'sku_fokus_mti' => 'sku_fokus_mti',
        'sku' => 'material',
        'sku_name' => 'material_description',
        'company' => 'principal',
    ];

    private array $numericColumns = [
        'isi_sap', 'isi_bosnet', 'conversion1', 'conversion2',
        'min_doi', 'target_doi', 'max_doi', 'trigger_point', 'max_point',
        'umur', 'vol_m3', 'weight_kg', 'metric_ton',
        'sku_fokus_nka', 'sku_fokus_mti',
    ];

    public function collection(Collection $collection): void
    {
        $this->totalRows = $collection->count();

        foreach ($collection as $row) {
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

                $data[$dbKey] = $this->cleanValue($value, $dbKey);
            }

            if (empty($data)) {
                $this->skipped++;

                continue;
            }

            $existing = null;
            if (! empty($data['material'])) {
                $existing = StandarUmurProduk::where('material', $data['material'])->first();
            }
            if (! $existing && ! empty($data['product_id'])) {
                $existing = StandarUmurProduk::where('product_id', $data['product_id'])->first();
            }

            if ($existing) {
                $existing->update($data);
            } else {
                StandarUmurProduk::create($data);
            }
            $this->imported++;
        }
    }

    private function cleanValue(mixed $value, string $dbKey): mixed
    {
        if ($value === null || $value === '' || $value === '?') {
            return null;
        }

        if (is_string($value)) {
            $value = trim($value);

            if ($value === '') {
                return null;
            }

            // Strip Excel formula strings
            if (str_starts_with($value, '=')) {
                return null;
            }

            // Convert numeric columns
            if (in_array($dbKey, $this->numericColumns)) {
                $numeric = (float) $value;

                return $numeric == (int) $numeric ? (int) $numeric : $numeric;
            }
        }

        return $value;
    }

    private function normalizeKey(string $key): string
    {
        $key = strtolower($key);
        $key = preg_replace('/[^a-z0-9]/', '', $key);

        return $key;
    }
}
