<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Ledger koreksi stok dari sesi opname yang disetujui.
 *
 * Wave menyimpan angka koreksi berjalan, tetapi angka itu tidak cukup untuk
 * sesi berikutnya: qty acuan per batch harus berasal dari qty ledger asli
 * ditambah seluruh koreksi yang sudah disetujui. Tanpa ledger ini, sesi
 * ulang pada wave yang sama akan membandingkan fisik dengan qty lama dan
 * menghasilkan koreksi ganda.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('opname_expired_adjustments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('session_id')->constrained('opname_expired_sessions')->cascadeOnDelete();
            $table->foreignId('wave_id')->constrained('opname_expired_waves')->cascadeOnDelete();
            $table->foreignId('batch_id')->nullable()->constrained('batches')->nullOnDelete();
            $table->foreignId('receiving_item_id')->nullable()->constrained('receiving_items')->nullOnDelete();

            // Batch id nullable tidak bisa dipakai sebagai unique key di MySQL
            // (NULL dianggap berbeda). item_key = "batch:{id}" atau "legacy"
            // membuat satu baris sesi hanya punya satu adjustment.
            $table->string('item_key', 80);

            $table->decimal('qty_crt', 12, 2)->default(0);
            $table->decimal('qty_pcs', 12, 2)->default(0);
            $table->decimal('expected_crt', 12, 2)->default(0);
            $table->decimal('expected_pcs', 12, 2)->default(0);
            $table->decimal('physical_crt', 12, 2)->default(0);
            $table->decimal('physical_pcs', 12, 2)->default(0);
            $table->string('disposition', 20)->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();

            $table->unique(['session_id', 'wave_id', 'item_key'], 'opname_adjustment_session_wave_item_unique');
            $table->index(['batch_id', 'approved_at']);
            $table->index(['wave_id', 'approved_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('opname_expired_adjustments');
    }
};
