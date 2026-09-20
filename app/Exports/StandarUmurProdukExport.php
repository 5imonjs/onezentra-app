<?php

namespace App\Exports;

use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class StandarUmurProdukExport implements FromCollection, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    protected Collection $data;

    public function __construct(Collection $data)
    {
        $this->data = $data;
    }

    public function collection(): Collection
    {
        return $this->data;
    }

    public function headings(): array
    {
        return [
            'Material',
            'Material Description',
            'Old material number',
            'Ext Material Group',
            'Country',
            'Principal',
            'Cluster',
            'Cluster2',
            'LOB',
            'Category',
            'Sub Category',
            'Brand',
            'Incubation',
            'Isi -SAP',
            'Isi -BOSnet',
            'Conversion1',
            'Conversion2',
            'MinDOI',
            'TargetDOI',
            'MaxDOI',
            'Trigger Point',
            'Max Point',
            'Supply Pattern',
            'Demand Pattern',
            'SKUGrp',
            'SKUConv.',
            'Umur',
            'Vol (m3)',
            'Weight (kg)',
            'MetricTon',
            'TypeSKU',
            'Uom',
            'Allocation Start',
            'Allocation End',
            'Uom2',
            'SKUStatus',
            'MadeIn',
            'Supplier ProductId',
            'NickName',
            'SKU Fokus NKA',
            'SKU Fokus MTI',
        ];
    }

    public function map($item): array
    {
        return [
            $item->material,
            $item->material_description,
            $item->old_material_number,
            $item->ext_material_group,
            $item->country,
            $item->principal,
            $item->cluster,
            $item->cluster2,
            $item->lob,
            $item->category,
            $item->sub_category,
            $item->brand,
            $item->incubation,
            $item->isi_sap,
            $item->isi_bosnet,
            $item->conversion1,
            $item->conversion2,
            $item->min_doi,
            $item->target_doi,
            $item->max_doi,
            $item->trigger_point,
            $item->max_point,
            $item->supply_pattern,
            $item->demand_pattern,
            $item->skugrp,
            $item->skuconv,
            $item->umur,
            $item->vol_m3,
            $item->weight_kg,
            $item->metric_ton,
            $item->type_sku,
            $item->uom,
            $item->allocation_start,
            $item->allocation_end,
            $item->uom2,
            $item->sku_status,
            $item->made_in,
            $item->product_id,
            $item->nickname,
            $item->sku_fokus_nka,
            $item->sku_fokus_mti,
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '4F46E5']],
            ],
        ];
    }
}
