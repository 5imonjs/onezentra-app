<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Laporan penerimaan memakai filter kode_depo + rentang tanggal secara
     * bersamaan. Index tunggal tanggal_penerimaan tidak terpakai karena
     * filter tanggal memakai COALESCE (fallback scan/receiving), tapi prefix
     * kesetaraan kode_depo pada index komposit ini tetap memangkas scan
     * menjadi hanya baris depo tersebut.
     */
    public function up(): void
    {
        Schema::table('receiving_items', function (Blueprint $table): void {
            if (! Schema::hasIndex('receiving_items', 'idx_ri_depo_tanggal')) {
                $table->index(['kode_depo', 'tanggal_penerimaan'], 'idx_ri_depo_tanggal');
            }
        });
    }

    public function down(): void
    {
        Schema::table('receiving_items', function (Blueprint $table): void {
            if (Schema::hasIndex('receiving_items', 'idx_ri_depo_tanggal')) {
                $table->dropIndex('idx_ri_depo_tanggal');
            }
        });
    }
};
