<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Cegah double-claim retribusi di level database: satu receiving hanya
     * boleh diklaim satu baris detail. Kolom nullable sehingga baris manual
     * (receiving_id NULL) tetap boleh banyak — MySQL & SQLite mengizinkan
     * banyak NULL dalam unique index.
     */
    public function up(): void
    {
        Schema::table('biaya_retribusi_details', function (Blueprint $table) {
            $table->unique('receiving_id', 'brd_receiving_id_unique');
        });
    }

    public function down(): void
    {
        Schema::table('biaya_retribusi_details', function (Blueprint $table) {
            $table->dropUnique('brd_receiving_id_unique');
        });
    }
};
