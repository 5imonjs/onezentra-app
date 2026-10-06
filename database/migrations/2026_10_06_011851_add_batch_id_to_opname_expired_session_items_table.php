<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Item sesi berbutir per batch (bukan per wave): satu wave berisi N
     * batch = N verifikasi fisik. batch_id nullable untuk baris warisan
     * yang labelnya diterbitkan susulan saat verifikasi.
     */
    public function up(): void
    {
        Schema::table('opname_expired_session_items', function (Blueprint $table) {
            // Unique lama menahan FK session_id di MySQL — lepas FK dulu.
            $table->dropForeign(['session_id']);
            $table->dropUnique(['session_id', 'wave_id']);
            $table->foreign('session_id')->references('id')->on('opname_expired_sessions')->cascadeOnDelete();
            $table->foreignId('batch_id')->nullable()->after('wave_id')->constrained('batches');
            $table->unique(['session_id', 'batch_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('opname_expired_session_items', function (Blueprint $table) {
            $table->dropUnique(['session_id', 'batch_id']);
            $table->dropConstrainedForeignId('batch_id');
            $table->dropForeign(['session_id']);
            $table->unique(['session_id', 'wave_id']);
            $table->foreign('session_id')->references('id')->on('opname_expired_sessions')->cascadeOnDelete();
        });
    }
};
