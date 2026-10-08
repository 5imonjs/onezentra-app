<?php

namespace App\Exports;

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

class BiayaRetribusiExport implements FromQuery, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    public function __construct(public EloquentBuilder|Relation $query, public ?User $user = null) {}

    public function query(): Builder|EloquentBuilder|Relation
    {
        $query = $this->query->with('details');

        // Sabuk ganda: controller sudah forUserDepot, tapi export yang
        // dibangun dari query lain tetap terkunci ke depo user scoped.
        if ($this->user && $this->user->isDepotScoped()) {
            $query->forUserDepot($this->user);
        }

        return $query;
    }

    public function headings(): array
    {
        return [
            'Tanggal', 'Kode Depo', 'Nama Depo', 'Total Nominal',
            'RFAH Required', 'Status',
        ];
    }

    public function map($row): array
    {
        return [
            $row->tanggal_pengajuan?->format('Y-m-d'),
            $row->kode_depo,
            $row->nama_depo,
            $row->nominal_biaya,
            $row->is_rfah_required ? 'Yes' : 'No',
            $row->status,
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [1 => ['font' => ['bold' => true]]];
    }
}
