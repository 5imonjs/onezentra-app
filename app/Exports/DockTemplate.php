<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class DockTemplate implements FromArray, ShouldAutoSize, WithHeadings, WithStyles
{
    public function array(): array
    {
        return [
            ['Dock Utama', 'DOCK-001', '50'],
            ['Dock Cadangan', 'DOCK-002', '30'],
        ];
    }

    public function headings(): array
    {
        return ['name', 'code', 'capacity'];
    }

    public function styles(Worksheet $sheet): array
    {
        return [1 => ['font' => ['bold' => true, 'size' => 11, 'color' => ['rgb' => 'FFFFFF']], 'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '4F46E5']]]];
    }
}
