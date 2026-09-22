<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Plat dan type kendaraan tambahan: satu kendaraan tambahan dipakai
     * bersama satu grup SJ (dicentang per grup di form). Nullable: hanya
     * terisi bila kendaraan_tambahan aktif.
     */
    public function up(): void
    {
        Schema::table('biaya_thl_details', function (Blueprint $table) {
            $table->string('kendaraan_nopol', 20)->nullable()->after('kendaraan_sj');
            $table->string('kendaraan_type', 50)->nullable()->after('kendaraan_nopol');
        });
    }

    public function down(): void
    {
        Schema::table('biaya_thl_details', function (Blueprint $table) {
            $table->dropColumn(['kendaraan_nopol', 'kendaraan_type']);
        });
    }
};
