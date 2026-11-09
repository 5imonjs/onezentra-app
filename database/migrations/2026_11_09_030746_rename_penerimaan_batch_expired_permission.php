<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Selaraskan label izin dengan nama laporan yang dipakai di sidebar.
     */
    public function up(): void
    {
        DB::table('permissions')
            ->where('slug', 'reports.penerimaan_batch_expired')
            ->update([
                'name' => 'Laporan Batch Kedaluwarsa View',
                'updated_at' => now(),
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('permissions')
            ->where('slug', 'reports.penerimaan_batch_expired')
            ->update([
                'name' => 'Laporan Penerimaan & Expired View',
                'updated_at' => now(),
            ]);
    }
};
