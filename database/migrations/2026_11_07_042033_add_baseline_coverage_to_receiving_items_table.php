<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Penanda koreksi: baris Receiving/SJ yang secara fisik sudah ada saat
     * baseline diambil, tetapi baru diinput setelah baseline. Baris tetap
     * tersimpan di ledger (tidak dihapus), namun tidak dihitung lagi sebagai
     * stok baru oleh Generate.
     */
    public function up(): void
    {
        Schema::table('receiving_items', function (Blueprint $table): void {
            $table->timestamp('baseline_covered_at')->nullable()->after('baseline_import_id');
            $table->foreignId('baseline_covered_by')
                ->nullable()
                ->after('baseline_covered_at')
                ->constrained('users')
                ->nullOnDelete();
            $table->text('baseline_cover_note')->nullable()->after('baseline_covered_by');

            $table->index('baseline_covered_at');
        });
    }

    public function down(): void
    {
        Schema::table('receiving_items', function (Blueprint $table): void {
            $table->dropIndex(['baseline_covered_at']);
            $table->dropConstrainedForeignId('baseline_covered_by');
            $table->dropColumn(['baseline_covered_at', 'baseline_cover_note']);
        });
    }
};
