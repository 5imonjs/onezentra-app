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

class BiayaThlReportExport implements FromQuery, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    public function __construct(public EloquentBuilder|Relation $query) {}

    public function query(): Builder|EloquentBuilder|Relation
    {
        return $this->query;
    }

    public function headings(): array
    {
        return [
            'Tanggal Pengajuan',
            'Depo',
            'No Surat Jalan',
            'Nama THL',
            'Posisi',
            'Nopol Kendaraan',
            'Type Kendaraan',
            'Droppoint',
            'Kubikasi',
            'Nominal Biaya',
            'Status Pengajuan',
        ];
    }

    public function map($detail): array
    {
        $parent = $detail->biayaThl;

        return [
            $parent?->tanggal_pengajuan?->toDateString() ?: '-',
            $parent?->nama_depo ?: ($parent?->kode_depo ?: '-'),
            $detail->no_surat_jalan ?? '-',
            $detail->nama_thl ?? '-',
            $detail->posisi ?? '-',
            $detail->nopol_kendaraan ?? '-',
            $detail->type_kendaraan ?? '-',
            $detail->droppoint ?? '-',
            (float) ($detail->kubikasi ?? 0),
            (float) ($detail->nominal_biaya ?? 0),
            $parent?->status ?? '-',
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
