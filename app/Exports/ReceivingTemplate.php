<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class ReceivingTemplate implements FromArray, ShouldAutoSize, WithHeadings, WithStyles
{
    public function array(): array
    {
        return [
            ['PO001', 'Driver Name', '2024-01-01'],
            ['PO002', 'Driver Name 2', '2024-01-02'],
        ];
    }

    public function headings(): array
    {
        return ['po_transporter', 'driver_name', 'tanggal_pengiriman'];
    }

    public function styles(Worksheet $sheet): array
    {
        return [1 => ['font' => ['bold' => true, 'size' => 11, 'color' => ['rgb' => 'FFFFFF']], 'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '4F46E5']]]];
    }
}
