<?php

namespace App\Exports;

use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class RencanaKirimItemTemplate implements FromCollection, ShouldAutoSize, WithHeadings, WithStyles
{
    public function collection(): Collection
    {
        return collect([
            [
                '90101111202100',
                'GKAOG7/AJTM-Garuda Kacang Atom Original -100g',
                5,
                'CRT',
                'GOOD',
            ],
            [
                '90102222302200',
                'KACANG AYAM BAWANG 250GR',
                10,
                'PCS',
                '',
            ],
        ]);
    }

    public function headings(): array
    {
        return [
            'Kode Barang',
            'Nama Barang',
            'Jumlah',
            'Satuan',
            'Keterangan',
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => 'solid', 'color' => ['rgb' => 'D97706']],
            ],
        ];
    }
}
