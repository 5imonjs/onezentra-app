<?php

namespace App\Exports;

use App\Models\ClusterPrincipal;
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

class ClusterPrincipalExport implements FromQuery, ShouldAutoSize, WithHeadings, WithMapping, WithStyles
{
    public function __construct(
        public ?string $search = null,
        public ?string $lob = null,
        public ?string $principal = null,
        public string $sort = 'product_sku',
        public string $direction = 'asc',
        public bool $empty = false,
    ) {
        $sortable = ['lob', 'product_category', 'product_group', 'product_sku', 'principal_1', 'principal_2'];
        if (! in_array($sort, $sortable, true)) {
            $sort = 'product_sku';
            $direction = 'asc';
        }
        $this->sort = $sort;
        $this->direction = strtolower($direction) === 'desc' ? 'desc' : 'asc';
    }

    public function query(): Builder|EloquentBuilder|Relation
    {
        $query = ClusterPrincipal::query();

        if ($this->empty) {
            return $query->whereRaw('1 = 0');
        }

        if ($this->search) {
            $like = LikePattern::contains($this->search);
            $query->where(function ($q) use ($like) {
                $q->whereRaw('product_sku LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('principal_1 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('principal_2 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('lob LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('product_category LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('product_group LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        if ($this->lob) {
            $query->where('lob', $this->lob);
        }

        if ($this->principal) {
            // Principal bisa ada di kolom 1 maupun 2 — filter harus menjangkau
            // keduanya, kalau tidak produk yang principal-nya ada di kolom 2
            // akan hilang dari hasil filter.
            $query->where(function ($q) {
                $q->where('principal_1', $this->principal)
                    ->orWhere('principal_2', $this->principal);
            });
        }

        return $query->orderBy($this->sort, $this->direction);
    }

    /**
     * Heading pakai label yang sama dengan kolom di UI, bukan nama kolom DB.
     * Template harus bisa langsung diisi user tanpa perlu menebak nama kolom.
     */
    public function headings(): array
    {
        return [
            'LOB',
            'Product Category',
            'Sub Product Category',
            'Product Group',
            'Product Class',
            'Product SKU',
            'Principal 1',
            'Principal 2',
        ];
    }

    public function map($row): array
    {
        return [
            $row->lob,
            $row->product_category,
            $row->sub_product_category,
            $row->product_group,
            $row->product_class,
            $row->product_sku,
            $row->principal_1,
            $row->principal_2,
        ];
    }

    public function styles(Worksheet $sheet): array
    {
        return [
            1 => [
                'font' => ['bold' => true, 'size' => 11, 'color' => ['rgb' => 'FFFFFF']],
                'fill' => ['fillType' => 'solid', 'color' => ['rgb' => '4F46E5']],
            ],
        ];
    }
}
