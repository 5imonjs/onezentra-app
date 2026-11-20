<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Rencana tiba di depo penerima — sengaja dipisah dari rkh_date
     * (rencana kirim / tanggal dokumen SJ) agar tidak ambigu.
     */
    public function up(): void
    {
        Schema::table('rencana_kirim', function (Blueprint $table): void {
            $table->date('eta_date')->nullable()->after('rkh_date');
        });
    }

    public function down(): void
    {
        Schema::table('rencana_kirim', function (Blueprint $table): void {
            $table->dropColumn('eta_date');
        });
    }
};
