<?php

namespace App\Exports;

use App\Models\Dock;
use App\Models\User;
use App\Support\LikePattern;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Concerns\WithStyles;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

class DockExport implements FromQuery, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
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
        $query = Dock::query();

        // Export WAJIB ter-scope depo seperti index: user tanpa
        // depot.view_all hanya mengekspor dock depo sendiri.
        if ($this->user && $this->user->isDepotScoped()) {
            $query->forUserDepot($this->user);
        } elseif ($this->kodeDepo) {
            $query->where('kode_depo', $this->kodeDepo);
        }

        if ($this->search) {
            $like = LikePattern::contains($this->search);
            $query->where(function ($q) use ($like) {
                $q->whereRaw('name LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('code LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }
        if ($this->status) {
            $query->where('status', $this->status);
        }

        return $query->orderBy('name');
    }

    public function headings(): array
    {
        return ['ID', 'Nama', 'Kode', 'Depo', 'Kapasitas', 'Status'];
    }

    public function map($item): array
    {
        return [
            $item->id,
            $item->name,
            $item->code ?? '-',
            $item->nama_depo ?? $item->kode_depo ?? '-',
            $item->capacity ?? '-',
            $item->status,
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [1 => ['font' => ['bold' => true, 'size' => 11, 'color' => ['rgb' => 'FFFFFF']], 'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '4F46E5']]]];
    }
}
