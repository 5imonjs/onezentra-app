<?php

namespace App\Exports;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithColumnFormatting;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class OpnameExpiredExport implements FromQuery, ShouldAutoSize, WithColumnFormatting, WithHeadings, WithMapping, WithStyles
{
    public function __construct(public EloquentBuilder|Relation $query) {}

    public function query(): Builder|EloquentBuilder|Relation
    {
        return $this->query;
    }

    public function headings(): array
    {
        return [
            'Depo',
            'Kode Barang',
            'Nama Barang',
            'Minggu',
            'Qty Ini (CRT/ZAK)',
            'Qty Ini (PCS)',
            'Qty Lalu (CRT/ZAK)',
            'Qty Lalu (PCS)',
            'Expired Date Ini',
            'Expired Date Lalu',
            'Sisa Hari',
            'Status Ini',
            'Status Lalu',
            'Perubahan',
            'Rekomendasi',
            'Sumber Material',
            'Tanggal Penerimaan',
        ];
    }

    public function map($wave): array
    {
        return [
            $wave->kode_depo,
            $wave->kode_barang,
            $wave->nama_barang,
            $wave->week_start,
            $wave->qty_ini_crt,
            $wave->qty_ini_pcs,
            $wave->qty_lalu_crt,
            $wave->qty_lalu_pcs,
            $wave->expired_date_ini?->format('d-m-Y'),
            $wave->expired_date_lalu?->format('d-m-Y'),
            $wave->sisa_hari,
            $wave->status_ini,
            $wave->status_lalu ?? '-',
            $wave->perubahan ?? '-',
            $wave->rekomendasi ?? '-',
            $wave->sumber_material ?? '-',
            $wave->tanggal_penerimaan?->format('d-m-Y') ?? '-',
        ];
    }

    public function columnFormats(): array
    {
        return [
            'A' => '@',
            'B' => '@',
            'D' => '@',
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
