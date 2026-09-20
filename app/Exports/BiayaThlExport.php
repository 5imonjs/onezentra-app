<?php

namespace App\Exports;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class BiayaThlExport implements FromQuery, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    public function __construct(public EloquentBuilder|Relation $query) {}

    public function query(): Builder|EloquentBuilder|Relation
    {
        return $this->query->with('details');
    }

    public function headings(): array
    {
        return [
            'Tanggal', 'Kode Depo', 'Nama Depo', 'No Kendaraan',
            'Type Kendaraan', 'No Surat Jalan', 'Kubikasi Base',
            'Total Nominal', 'RFAH Required', 'Status',
        ];
    }

    public function map($row): array
    {
        return [
            $row->tanggal_pengajuan?->format('Y-m-d'),
            $row->kode_depo,
            $row->nama_depo,
            $row->no_kendaraan,
            $row->type_kendaraan,
            $row->no_surat_jalan,
            $row->kubikasi_base,
            $row->nominal_biaya,
            $row->is_rfah_required ? 'Yes' : 'No',
            $row->status,
        ];
    }

    public function styles(Worksheet $sheet)
    {
        $sheet->getStyle('1')->getFont()->setBold(true);
    }
}
