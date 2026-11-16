<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Karantina batch adalah status stok, bukan status dokumen.
 *
 * Batch yang disetujui RETUR/DISPOSAL tetap ada di monitoring opname sampai
 * barang benar-benar keluar, tetapi tidak boleh dianggap tersedia untuk
 * pengiriman normal. Kolom ini menyimpan alasan + sesi yang memutuskan agar
 * blokir stok bisa diaudit.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('batches', function (Blueprint $table): void {
            $table->timestamp('quarantined_at')->nullable();
            $table->foreignId('quarantined_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('quarantine_session_id')->nullable()->constrained('opname_expired_sessions')->nullOnDelete();
            $table->string('quarantine_reason', 255)->nullable();

            $table->index(['status', 'quarantined_at']);
        });
    }

    public function down(): void
    {
        Schema::table('batches', function (Blueprint $table): void {
            $table->dropForeign(['quarantined_by']);
            $table->dropForeign(['quarantine_session_id']);
            $table->dropIndex(['status', 'quarantined_at']);
            $table->dropColumn([
                'quarantined_at',
                'quarantined_by',
                'quarantine_session_id',
                'quarantine_reason',
            ]);
        });
    }
};
