<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * BOSnetszProductId adalah identitas produk NPN. Tanpa unique index,
     * import paralel/retry bisa membuat dua baris untuk produk yang sama.
     * Migration ini gagal-tertutup bila sudah ada duplikat: bersihkan dulu
     * dengan `php artisan npn:duplicates` lalu `npn:deduplicate --apply`.
     */
    public function up(): void
    {
        // String kosong bukan identitas produk; samakan dengan NULL agar
        // unique index tidak menganggap banyak baris kosong sebagai duplikat.
        DB::table('npn')
            ->where('BOSnetszProductId', '')
            ->update(['BOSnetszProductId' => null]);

        $duplicates = DB::table('npn')
            ->select('BOSnetszProductId', DB::raw('COUNT(*) as aggregate'))
            ->whereNotNull('BOSnetszProductId')
            ->groupBy('BOSnetszProductId')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        if ($duplicates->isNotEmpty()) {
            $codes = $duplicates->pluck('BOSnetszProductId')->take(10)->implode(', ');

            throw new RuntimeException(
                'NPN memiliki BOSnetszProductId duplikat ('.$duplicates->count().' kode, contoh: '.$codes.'). '.
                'Jalankan `php artisan npn:duplicates` untuk melihatnya, lalu '.
                '`php artisan npn:deduplicate --apply --confirm="DEDUPLICATE NPN"` setelah backup.'
            );
        }

        Schema::table('npn', function (Blueprint $table): void {
            $table->unique('BOSnetszProductId', 'npn_bos_product_id_unique');
        });
    }

    public function down(): void
    {
        Schema::table('npn', function (Blueprint $table): void {
            $table->dropUnique('npn_bos_product_id_unique');
        });
    }
};
