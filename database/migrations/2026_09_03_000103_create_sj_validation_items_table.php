<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sj_validation_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('sj_validation_id');
            $table->unsignedBigInteger('shipment_item_id');
            $table->unsignedBigInteger('npn_id')->nullable();
            $table->string('barcode')->nullable();
            $table->string('kode_barang', 50)->nullable();
            $table->string('nama_barang', 200)->nullable();
            $table->decimal('expected_qty', 10, 2)->default(0);
            $table->decimal('actual_qty', 10, 2)->default(0);
            $table->date('expired_date')->nullable();
            $table->string('satuan', 20)->nullable();
            $table->string('condition', 20)->default('GOOD'); // GOOD, DAMAGED, MISSING
            $table->text('notes')->nullable();
            $table->string('status', 20)->default('PENDING'); // PENDING, VALIDATED, MISMATCH
            $table->timestamps();

            $table->foreign('sj_validation_id')->references('id')->on('sj_validations')->onDelete('cascade');
            $table->foreign('shipment_item_id')->references('id')->on('shipment_items')->onDelete('cascade');
            $table->index('sj_validation_id');
            $table->index('barcode');
            $table->index('kode_barang');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sj_validation_items');
    }
};
