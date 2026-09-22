<?php

namespace App\Exports;

use App\Models\StandarUmurProduk;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class StandarUmurProdukExport implements FromQuery, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    public ?string $search = null;

    public ?string $brand = null;

    public ?string $category = null;

    public string $sort = 'material_description';

    public string $direction = 'asc';

    public function __construct(
        ?string $search = null,
        ?string $brand = null,
        ?string $category = null,
        string $sort = 'material_description',
        string $direction = 'asc',
    ) {
        $this->search = $search;
        $this->brand = $brand;
        $this->category = $category;
        $sortable = ['material', 'material_description', 'brand', 'category', 'umur'];
        if (! in_array($sort, $sortable, true)) {
            $sort = 'material_description';
            $direction = 'asc';
        }
        $this->sort = $sort;
        $this->direction = strtolower($direction) === 'desc' ? 'desc' : 'asc';
    }

    public function query(): Builder|EloquentBuilder|Relation
    {
        $query = StandarUmurProduk::query();

        if ($this->search) {
            $query->where(function ($q) {
                $q->where('material', 'like', '%'.$this->search.'%')
                    ->orWhere('material_description', 'like', '%'.$this->search.'%');
            });
        }

        if ($this->brand) {
            $query->where('brand', $this->brand);
        }

        if ($this->category) {
            $query->where('category', $this->category);
        }

        return $query->orderBy($this->sort, $this->direction);
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
