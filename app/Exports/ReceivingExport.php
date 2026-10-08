<?php

namespace App\Exports;

use App\Models\Receiving;
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

class ReceivingExport implements FromQuery, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    public ?string $search = null;

    public ?string $status = null;

    public ?User $user = null;

    public ?string $kodeDepo = null;

    public function __construct(?string $search = null, ?string $status = null, ?User $user = null, ?string $kodeDepo = null)
    {
        $this->search = $search;
        $this->status = $status;
        $this->user = $user;
        $this->kodeDepo = $kodeDepo;
    }

    public function query(): Builder|EloquentBuilder|Relation
    {
        $query = Receiving::with(['rencanaKirim', 'dock']);

        // Export WAJIB ter-scope depo seperti index: user tanpa
        // depot.view_all hanya mengekspor receiving depo sendiri.
        if ($this->user && $this->user->isDepotScoped()) {
            $query->whereHas('rencanaKirim', fn ($q) => $q->forUserDepot($this->user));
        } elseif ($this->kodeDepo) {
            $query->whereHas('rencanaKirim', fn ($q) => $q->where('kode_depo', $this->kodeDepo));
        }

        if ($this->search) {
            $like = '%'.addcslashes($this->search, '\\%_').'%';
            $query->whereHas('rencanaKirim', fn ($q) => $q->whereRaw('po_transporter LIKE ? ESCAPE ?', [$like, '\\']));
        }
        if ($this->status) {
            $query->where('status', $this->status);
        }

        return $query->orderByDesc('created_at');
    }

    public function headings(): array
    {
        return ['ID', 'PO Transporter', 'Driver', 'Status', 'Qty Expected', 'Qty Received', 'Depo', 'Dibuat'];
    }

    public function map($item): array
    {
        return [
            $item->id,
            $item->rencanaKirim?->po_transporter ?? '-',
            $item->rencanaKirim?->driver_name ?? '-',
            $item->status,
            $item->total_expected_qty,
            $item->total_received_qty,
            $item->rencanaKirim?->kode_depo ?? '-',
            $item->created_at->format('Y-m-d H:i:s'),
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [1 => ['font' => ['bold' => true, 'size' => 11, 'color' => ['rgb' => 'FFFFFF']], 'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '4F46E5']]]];
    }
}
