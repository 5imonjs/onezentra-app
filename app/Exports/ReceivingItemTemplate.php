<?php

namespace App\Exports;

use DateTimeImmutable;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Shared\Date;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class ReceivingItemTemplate implements FromArray, ShouldAutoSize, WithHeadings, WithStyles
{
    public function array(): array
    {
        return [
            // Operator cukup mengisi 5 kolom di bawah — KODE BARANG akan
            // ditulis sistem dari lookup NPN, begitu pula CLUSTER + PRINCIPAL.
            // Tanggal ditulis sebagai serial Excel dengan tampilan dd/mm/yyyy
            // agar operator melihat format yang sama dengan yang diurai importer.
            [
                'ESVAG150', '10', '120',
                Date::PHPToExcel(new DateTimeImmutable('2027-01-31')),
                Date::PHPToExcel(new DateTimeImmutable('2026-09-05')),
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
            'D' => ['numberFormat' => ['formatCode' => 'dd/mm/yyyy']],
            'E' => ['numberFormat' => ['formatCode' => 'dd/mm/yyyy']],
        ];
    }
}
