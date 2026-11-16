<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Jejak append-only untuk aksi destruktif pada baseline (reset/hapus).
 *
 * Manifes baseline di-soft-delete agar bisa diimpor ulang. Tanpa tabel ini,
 * alasan dan aktor penghapusan hilang bersama manifes yang sudah tidak
 * tampil di daftar baseline.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('opname_expired_baseline_audits', function (Blueprint $table): void {
            $table->id();
            $table->unsignedBigInteger('baseline_import_id');
            $table->string('kode_depo', 20)->nullable();
            $table->string('nama_depo', 100)->nullable();
            $table->string('action', 30)->default('reset');
            $table->text('reason');
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('deleted_items')->default(0);
            $table->unsignedInteger('deleted_batches')->default(0);
            $table->unsignedInteger('deleted_waves')->default(0);
            $table->unsignedInteger('deleted_session_items')->default(0);
            $table->json('manifest_snapshot')->nullable();
            $table->timestamps();

            $table->index('baseline_import_id');
            $table->index(['kode_depo', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('opname_expired_baseline_audits');
    }
};
