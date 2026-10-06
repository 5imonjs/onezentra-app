<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Satu baris = satu wave yang ditugaskan dalam sesi. Hasil verifikasi
     * fisik (qty + kondisi) ditulis ke sini, lalu diteruskan ke wave
     * (qty_koreksi_*, validated_by/at) + penerbitan Batch per baris ledger.
     */
    public function up(): void
    {
        Schema::create('opname_expired_session_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')->constrained('opname_expired_sessions')->cascadeOnDelete();
            $table->foreignId('wave_id')->constrained('opname_expired_waves')->cascadeOnDelete();
            $table->decimal('qty_fisik_crt', 12, 2)->nullable();
            $table->decimal('qty_fisik_pcs', 12, 2)->nullable();
            $table->string('condition', 32)->nullable();
            $table->string('photo')->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users');
            $table->timestamps();

            $table->unique(['session_id', 'wave_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('opname_expired_session_items');
    }
};
