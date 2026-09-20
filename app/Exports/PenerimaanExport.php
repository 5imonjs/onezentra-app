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

class PenerimaanExport implements FromQuery, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    public function __construct(public EloquentBuilder|Relation $query) {}

    public function query(): Builder|EloquentBuilder|Relation
    {
        return $this->query;
    }

    public function headings(): array
    {
        return [
            'Tanggal Penerimaan',
            'Depo',
            'Sumber Material',
            'PO Transporter',
            'Driver',
            'Kode Barang',
            'Nama Barang',
            'Qty CRT',
            'Qty PCS',
            'Satuan',
            'Expired Date',
            'Kondisi',
            'Selisih',
            'Alasan Selisih',
            'Catatan',
            'Sumber',
        ];
    }

    public function map($item): array
    {
        $rk = $item->receiving?->rencanaKirim;

        return [
            $item->tanggal_penerimaan ?: $item->created_at?->toDateString(),
            $item->getNamaDepoFallback() ?: ($item->getKodeDepoFallback() ?: '-'),
            $item->getSumberMaterialFallback() ?: '-',
            $rk->po_transporter ?? '-',
            $rk->driver_name ?? '-',
            $item->kode_barang,
            $item->nama_barang ?: $item->kode_barang,
            (float) $item->actual_qty,
            (float) ($item->qty_pcs ?? 0),
            $item->satuan ?? '-',
            $item->expired_date?->toDateString() ?: '-',
            $item->condition ?? '-',
            (float) ($item->selisih_qty ?: 0),
            $item->selisih_reason ?? '-',
            $item->notes ?? '-',
            $item->source,
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
