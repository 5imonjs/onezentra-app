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
            // Operator cukup mengisi 5 kolom di bawah — KODE BARANG akan
            // ditulis sistem dari lookup NPN, begitu pula CLUSTER + PRINCIPAL.
            [
                'ESVAG150', '10', '120', '2027-01-31', '2026-09-09',
            ],
        ];
    }

    public function headings(): array
    {
        return [
            'PRODUK',
            'QTY DUS/BALL',
            'QTY PCS',
            'EXPIRED',
            'TANGGAL PENERIMAAN',
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
