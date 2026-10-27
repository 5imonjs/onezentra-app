<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Barang di luar rencana kirim (deviation record).
     *
     * Fase 1: operator memvalidasi kenyataan fisik — barang yang dibawa
     * transporter tetapi tidak ada di rencana planner — tanpa mengedit
     * rencana. Baris ini TIDAK masuk `sj_validation_items` supaya semua
     * agregat plan-vs-aktual (receiving, reporting) tetap menghitung hanya
     * baris rencana; keputusan penerimaan ada di planner (fase approval).
     */
    public function up(): void
    {
        Schema::create('sj_validation_extra_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('sj_validation_id');
            $table->unsignedBigInteger('npn_id')->nullable();
            $table->string('barcode', 100)->nullable();
            $table->string('kode_barang', 50);
            $table->string('nama_barang', 200);
            $table->decimal('qty', 10, 2)->default(0);
            $table->string('satuan', 20)->nullable();
            $table->string('condition', 20)->default('FISIK_BAGUS'); // GOOD, DAMAGED, MISSING
            $table->date('expired_date')->nullable();
            $table->string('photo'); // bukti fisik wajib — menggantikan catatan kertas
            $table->text('notes')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->foreign('sj_validation_id')->references('id')->on('sj_validations')->onDelete('cascade');
            $table->foreign('npn_id')->references('id')->on('npn')->nullOnDelete();
            $table->index('sj_validation_id');
            $table->index('barcode');
            $table->index('kode_barang');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('sj_validation_extra_items');
    }
};
