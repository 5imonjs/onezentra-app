<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Jejak batch penyusun tiap baris wave: agregat tetap per
     * barang+depo+expired, tapi identitas batch tidak hilang.
     */
    public function up(): void
    {
        Schema::table('opname_expired_waves', function (Blueprint $table) {
            $table->json('batch_numbers')->nullable()->after('rekomendasi');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('opname_expired_waves', function (Blueprint $table) {
            $table->dropColumn('batch_numbers');
        });
    }
};
