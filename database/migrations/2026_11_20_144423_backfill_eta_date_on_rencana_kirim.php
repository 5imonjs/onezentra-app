<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Rencana lama dibuat sebelum ETA wajib diisi. Isi dari rkh_date agar
     * semua baris punya "rencana tiba" dan bisa dipakai user lain.
     */
    public function up(): void
    {
        DB::table('rencana_kirim')
            ->whereNull('eta_date')
            ->whereNotNull('rkh_date')
            ->update(['eta_date' => DB::raw('rkh_date')]);
    }

    public function down(): void
    {
        // Backfill sengaja tidak dibatalkan: ETA sudah jadi data operasional.
    }
};
