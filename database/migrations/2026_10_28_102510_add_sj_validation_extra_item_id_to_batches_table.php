<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Barang luar rencana yang DISETUJUI planner mendapat batch label siap
     * cetak — sama seperti item rencana kirim (yang memakai
     * sj_validation_item_id). Link keempat di batches: dokumen-level
     * (receiving_id), item rencana (sj_validation_item_id), ledger
     * sesi/import (receiving_item_id), kini catatan deviasi yang disetujui.
     */
    public function up(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            $table->unsignedBigInteger('sj_validation_extra_item_id')
                ->nullable()
                ->after('sj_validation_item_id');
            $table->index('sj_validation_extra_item_id');
        });
    }

    public function down(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            $table->dropIndex(['sj_validation_extra_item_id']);
            $table->dropColumn('sj_validation_extra_item_id');
        });
    }
};
