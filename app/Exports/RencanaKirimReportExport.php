<?php

namespace App\Exports;

use App\Models\RencanaKirim;
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

class RencanaKirimReportExport implements FromQuery, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    public function __construct(
        public ?string $dateFrom = null,
        public ?string $dateTo = null,
        public ?string $status = null,
        public ?string $kodeDepo = null,
        public ?string $search = null,
        public ?User $user = null,
    ) {}

    /**
     * Filter identik dengan rencanaKirimQuery() di ReportController agar
     * export selalu konsisten dengan laporan yang tampil di layar.
     */
    public static function applyFilters(
        EloquentBuilder $query,
        ?string $dateFrom,
        ?string $dateTo,
        ?string $status,
        ?string $kodeDepo,
        ?string $search,
        ?User $user,
    ): EloquentBuilder {
        if ($user && $user->isDepotScoped()) {
            $query->forUserDepot($user);
        }

        if ($dateFrom) {
            $query->where('rkh_date', '>=', $dateFrom);
        }

        if ($dateTo) {
            $query->where('rkh_date', '<=', $dateTo);
        }

        if ($status) {
            $query->where('status', $status);
        }

        if ($kodeDepo) {
            $query->where('kode_depo', $kodeDepo);
        }

        if ($search) {
            $like = "%{$search}%";
            $query->where(fn ($q) => $q
                ->where('po_transporter', 'like', $like)
                ->orWhere('driver_name', 'like', $like)
                ->orWhere('nopol', 'like', $like)
                ->orWhere('destination_name', 'like', $like));
        }

        return $query;
    }

    public function query(): Builder|EloquentBuilder|Relation
    {
        $query = RencanaKirim::query()->with(['items.npn']);

        return static::applyFilters(
            $query,
            $this->dateFrom,
            $this->dateTo,
            $this->status,
            $this->kodeDepo,
            $this->search,
            $this->user,
        )->orderByDesc('rkh_date')->orderByDesc('id');
    }

    public function headings(): array
    {
        return [
            'Tanggal RKH',
            'PO Transporter',
            'Driver',
            'Nopol',
            'Expedisi',
            'Jenis Kendaraan',
            'Tujuan',
            'Depo',
            'Total Qty',
            'Kubikasi (m³)',
            'Status',
            'Dibuat',
        ];
    }

    public function map($rk): array
    {
        // Kubikasi = rumus yang sama dengan ReportController::rencanaKirimRow
        // (jumlah x decVolume x SAPdecUom / 1.000.000 per item).
        $kubikasi = $rk->items->sum(fn ($item) => $item->npn?->decVolume !== null && $item->npn?->SAPdecUom !== null
            ? round(((float) $item->jumlah) * ((float) $item->npn->decVolume) * ((float) $item->npn->SAPdecUom) / 1_000_000, 4)
            : 0);

        return [
            $rk->rkh_date?->format('d-m-Y') ?? '-',
            $rk->po_transporter ?? '-',
            $rk->driver_name ?? '-',
            $rk->nopol ?? '-',
            $rk->expedisi ?? '-',
            $rk->jenis_kendaraan ?? '-',
            $rk->destination_name ?? '-',
            $rk->nama_depo ?? $rk->kode_depo ?? '-',
            (float) $rk->total_qty,
            round($kubikasi, 2),
            $rk->status,
            $rk->created_at?->format('d-m-Y'),
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '0F172A']],
            ],
        ];
    }
}
