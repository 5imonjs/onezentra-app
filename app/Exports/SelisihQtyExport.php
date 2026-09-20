<?php

namespace App\Exports;

use App\Models\ReceivingItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class SelisihQtyExport implements FromQuery, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    public function __construct(
        public ?string $dateFrom = null,
        public ?string $dateTo = null,
        public ?string $kodeDepo = null,
        public ?User $user = null,
    ) {}

    public function query(): Builder|EloquentBuilder|Relation
    {
        $query = ReceivingItem::with(['receiving.rencanaKirim', 'validator'])
            ->whereNotNull('selisih_qty')
            ->where('selisih_qty', '!=', 0);

        if ($this->user && $this->user->isDepotScoped()) {
            $query->whereHas('receiving.rencanaKirim', fn ($q) => $q->forUserDepot($this->user));
        }

        if ($this->dateFrom) {
            $query->whereHas('receiving', fn ($q) => $q->whereDate('created_at', '>=', $this->dateFrom));
        }

        if ($this->dateTo) {
            $query->whereHas('receiving', fn ($q) => $q->whereDate('created_at', '<=', $this->dateTo));
        }

        if ($this->kodeDepo) {
            $query->whereHas('receiving.rencanaKirim', fn ($q) => $q->where('kode_depo', $this->kodeDepo));
        }

        return $query->orderByDesc('receiving_items.created_at');
    }

    public function headings(): array
    {
        return [
            'Tanggal',
            'PO Transporter',
            'Kode Barang',
            'Nama Barang',
            'Qty Plan',
            'Qty Aktual',
            'Selisih',
            'Alasan',
            'Kondisi',
            'Divalidasi Oleh',
        ];
    }

    public function map($item): array
    {
        $rk = $item->receiving->rencanaKirim;

        return [
            $item->created_at->format('d-m-Y H:i'),
            $rk->po_transporter ?? '-',
            $item->kode_barang,
            $item->nama_barang,
            $item->expected_qty,
            $item->actual_qty,
            $item->selisih_qty,
            $item->selisih_reason ?? '-',
            $item->condition ?? '-',
            $item->validator->full_name ?? '-',
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'size' => 11],
                'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '4F46E5']],
                'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            ],
        ];
    }
}
