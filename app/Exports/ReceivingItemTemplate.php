<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class ReceivingItemTemplate implements FromArray, ShouldAutoSize, WithHeadings, WithStyles
{
    public function array(): array
    {
        return [
            [
                'B-0001', 'Produk Contoh', '10', '120', '2027-01-31', '2026-09-09',
                'PT Pengirim Contoh', 'DPO001', 'Depo Contoh', 'CRT',
            ],
        ];
    }

    public function headings(): array
    {
        return [
            'KODE BARANG',
            'NAMA BARANG',
            'QTY CRT/ZAK',
            'QTY PCS',
            'TGL EXPIRED DATE',
            'TGL PENERIMAAN',
            'SUMBER MATERIAL',
            'KODE DEPO',
            'NAMA DEPO',
            'SATUAN',
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'size' => 11, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '4F46E5']],
            ],
        ];
    }
}
