<?php

namespace App\Services;

use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder;

class ExportGuard
{
    public static function limit(): int
    {
        return (int) config('exports.max_rows', 50000);
    }

    /**
     * Gagalkan export (422) bila baris melebihi batas — hitung via COUNT
     * murah, bukan dengan memuat seluruh baris ke memori.
     */
    public static function ensureWithinLimit(EloquentBuilder|Builder|Relation $query): void
    {
        // reorder(): agregat + ORDER BY tanpa GROUP BY ditolak MySQL
        // (ONLY_FULL_GROUP_BY) walau lolos di SQLite.
        $count = (clone $query)->reorder()->toBase()->count();

        abort_if(
            $count > static::limit(),
            422,
            'Data melebihi batas '.number_format(static::limit(), 0, ',', '.').' baris'
            .' ('.number_format((int) $count, 0, ',', '.').' baris). Persempit filter lalu coba lagi.'
        );
    }
}
