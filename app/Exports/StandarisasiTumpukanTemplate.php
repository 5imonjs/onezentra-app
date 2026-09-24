<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class StandarisasiTumpukanTemplate implements FromArray, ShouldAutoSize, WithHeadings, WithStyles
{
    public function array(): array
    {
        return [
            ['PROD001', '1', '5'],
            ['PROD002', '2', '10'],
        ];
    }

    public function headings(): array
    {
        return ['npn_id', 'tier', 'tinggi_tumpukan'];
    }

    public function styles(Worksheet $sheet): array
    {
        return [1 => ['font' => ['bold' => true, 'size' => 11, 'color' => ['rgb' => 'FFFFFF']], 'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '4F46E5']]]];
    }
}
