<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Hapus baris ledger tidak boleh gagal total hanya karena batch-nya
     * dirujuk item sesi yang belum terverifikasi: rujukan itu dinullkan,
     * verifikasi susulan menerbitkan label baru bila perlu. Baris yang
     * batch-nya sudah TERVERIFIKASI tetap dilindungi di level aplikasi
     * (422) — itu bukti kerja lapangan.
     */
    public function up(): void
    {
        Schema::table('opname_expired_session_items', function (Blueprint $table) {
            $table->dropForeign(['batch_id']);
            $table->foreign('batch_id')->references('id')->on('batches')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('opname_expired_session_items', function (Blueprint $table) {
            $table->dropForeign(['batch_id']);
            $table->foreign('batch_id')->references('id')->on('batches');
        });
    }
};
