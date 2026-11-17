<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Barang luar rencana kirim yang DISETUJUHI planner ikut menjadi baris ledger
 * penerimaan. Tanpa kolom ini, extra item hanya hidup di
 * `sj_validation_extra_items` + label batch dan tidak pernah masuk kandidat
 * biaya retribusi (yang menjumlah `receiving_items.actual_qty`).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receiving_items', function (Blueprint $table): void {
            $table->foreignId('sj_validation_extra_item_id')
                ->nullable()
                ->after('sj_validation_item_id')
                ->constrained('sj_validation_extra_items')
                ->nullOnDelete();

            $table->index('sj_validation_extra_item_id');
        });
    }

    public function down(): void
    {
        Schema::table('receiving_items', function (Blueprint $table): void {
            $table->dropForeign(['sj_validation_extra_item_id']);
            $table->dropIndex(['sj_validation_extra_item_id']);
            $table->dropColumn('sj_validation_extra_item_id');
        });
    }
};
