<?php

namespace App\Exports;

use App\Models\StandarisasiTumpukan;
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

class StandarisasiTumpukanExport implements FromQuery, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    public ?string $search = null;

    public ?string $status = null;

    public ?string $kodeDepo = null;

    private ?User $user = null;

    public function __construct(?string $search = null, ?string $status = null, ?User $user = null, ?string $kodeDepo = null)
    {
        $this->search = $search;
        $this->status = $status;
        $this->user = $user;
        $this->kodeDepo = $kodeDepo;
    }

    public function query(): Builder|EloquentBuilder|Relation
    {
        $query = StandarisasiTumpukan::with('npn');

        // Scoping depo mengikuti pola OpnameExpiredController:export.
        if ($this->user && $this->user->isDepotScoped()) {
            $query->forUserDepot($this->user);
        } elseif ($this->kodeDepo) {
            $query->where('kode_depo', $this->kodeDepo);
        }

        if ($this->search) {
            $like = '%'.addcslashes($this->search, '\\%_').'%';
            $query->whereHas('npn', fn ($q) => $q
                ->whereRaw('szNickName LIKE ? ESCAPE ?', [$like, '\\'])
                ->orWhereRaw('BOSnetszProductId LIKE ? ESCAPE ?', [$like, '\\']));
        }
        if ($this->status) {
            $query->where('status', $this->status);
        }

        return $query->orderByDesc('created_at');
    }

    public function headings(): array
    {
        return ['ID', 'BOS ID', 'Produk', 'Tier', 'Tinggi', 'Total', 'Status', 'Depo', 'Dibuat'];
    }

    public function map($item): array
    {
        return [
            $item->id,
            $item->npn?->BOSnetszProductId ?? '-',
            $item->npn?->szShortDescription ?? '-',
            $item->tier,
            $item->tinggi_tumpukan,
            $item->total_tier_tinggi,
            $item->status,
            $item->nama_depo,
            $item->created_at->format('Y-m-d H:i:s'),
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [1 => ['font' => ['bold' => true, 'size' => 11, 'color' => ['rgb' => 'FFFFFF']], 'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '4F46E5']]]];
    }
}
