<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Barcode label adalah identitas fisik batch untuk FEFO/traceability:
     * wajib unik di database (sebelumnya hanya dicek di level aplikasi
     * sehingga duplikat fisik bisa lolos race).
     */
    public function up(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            $table->unique('barcode_label');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            $table->dropUnique(['barcode_label']);
        });
    }
};
