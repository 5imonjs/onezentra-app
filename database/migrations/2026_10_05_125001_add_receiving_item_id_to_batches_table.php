<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tautan batch ke baris ledger hasil verifikasi sesi lapangan (aturan
     * A2). Batch SJ memakai sj_validation_item_id; batch sesi memakai
     * kolom ini. Keduanya nullable dan saling lepas.
     */
    public function up(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            $table->foreignId('receiving_item_id')->nullable()->after('sj_validation_item_id')->constrained('receiving_items');
            $table->index('receiving_item_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            $table->dropConstrainedForeignId('receiving_item_id');
        });
    }
};
