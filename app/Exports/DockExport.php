<?php

namespace App\Exports;

use App\Models\Dock;
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

    public function __construct(?string $search = null, ?string $status = null)
    {
        $this->search = $search;
        $this->status = $status;
    }

    public function query(): Builder|EloquentBuilder|Relation
    {
        $query = Dock::query();

        if ($this->search) {
            $query->where(function ($q) {
                $q->where('name', 'like', '%'.$this->search.'%')
                    ->orWhere('code', 'like', '%'.$this->search.'%');
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
