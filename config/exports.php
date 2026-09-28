<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Batas baris export
    |--------------------------------------------------------------------------
    |
    | Export Excel membangun seluruh worksheet di memori (PhpSpreadsheet),
    | sehingga export tanpa batas dapat menghabiskan memori PHP pada data
    | besar. Setiap endpoint export wajib memanggil
    * App\Services\ExportGuard::ensureWithinLimit() sebelum mengunduh.
    */
    'max_rows' => (int) env('EXPORT_MAX_ROWS', 50000),
];
