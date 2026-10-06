<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Sesi opname lapangan: satu sesi = satu minggu + satu depo + satu
     * petugas. Label batch diterbitkan saat petugas verifikasi fisik
     * (aturan A2), bukan saat import.
     */
    public function up(): void
    {
        Schema::create('opname_expired_sessions', function (Blueprint $table) {
            $table->id();
            $table->date('week_start');
            $table->date('week_end');
            $table->string('kode_depo', 20);
            $table->string('nama_depo', 100)->nullable();
            $table->foreignId('assigned_to')->constrained('users');
            $table->string('status', 20)->default('OPEN');
            $table->text('notes')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->foreignId('created_by')->constrained('users');
            $table->timestamps();

            $table->index(['week_start', 'kode_depo']);
            $table->index('assigned_to');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('opname_expired_sessions');
    }
};
