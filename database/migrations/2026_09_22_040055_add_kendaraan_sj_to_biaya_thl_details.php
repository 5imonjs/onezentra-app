<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Nomor SJ kendaraan tambahan: kendaraan tambahan beroperasi di bawah
     * SJ berbeda dari SJ grup pekerja (satu kendaraan dipakai bersama).
     * Nullable: hanya terisi bila kendaraan_tambahan aktif.
     */
    public function up(): void
    {
        Schema::table('biaya_thl_details', function (Blueprint $table) {
            $table->string('kendaraan_sj', 50)->nullable()->after('kendaraan_tambahan');
        });
    }

    public function down(): void
    {
        Schema::table('biaya_thl_details', function (Blueprint $table) {
            $table->dropColumn('kendaraan_sj');
        });
    }
};
