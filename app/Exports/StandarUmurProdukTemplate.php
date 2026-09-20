<?php

namespace App\Exports;

use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class StandarUmurProdukTemplate implements FromCollection, ShouldAutoSize, WithHeadings, WithStyles
{
    public function collection(): Collection
    {
        return collect([]);
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
