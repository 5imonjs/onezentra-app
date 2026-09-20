<?php

namespace App\Exports;

use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class RencanaKirimTemplate implements FromCollection, ShouldAutoSize, WithHeadings, WithStyles
{
    public function collection(): Collection
    {
        return collect([
            [
                '0127-26-000000001',
                '2026-09-07',
                'RANGGA',
                'KB8292GF',
                'POJOK EKSPEDISI',
                'PT SNS GLOBAL',
                'Jl. Raya Industri No. 1',
                '0812-3456-7890',
                '0127',
                'SINGKAWANG',
                'SINGKAWANG',
                'Jl. Raya Singkawang No. 10',
                'Contoh baris: setiap baris = satu barang. No PO Transporter yang sama = satu rencana.',
                '90101111202100',
                'GKAOG7/AJTM-Garuda Kacang Atom Original -100g',
                5,
                'CRT',
                'GOOD',
            ],
        ]);
    }

    public function headings(): array
    {
        return [
            'No. PO Transporter',
            'Tanggal RKH',
            'Nama Driver',
            'Nopol',
            'Expedisi',
            'Shipper',
            'Alamat Shipper',
            'Telp Shipper',
            'Kode Depo',
            'Nama Depo',
            'Ditujukan',
            'Alamat Tujuan',
            'Catatan',
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
                'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '4F46E5']],
            ],
        ];
    }
}
