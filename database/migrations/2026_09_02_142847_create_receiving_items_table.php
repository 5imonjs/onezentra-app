<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('receiving_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('receiving_id');
            $table->unsignedBigInteger('shipment_item_id')->nullable();
            $table->string('barcode', 50)->nullable();
            $table->string('kode_barang', 50)->nullable();
            $table->string('nama_barang', 200)->nullable();
            $table->decimal('expected_qty', 10, 2)->default(0);
            $table->decimal('actual_qty', 10, 2)->default(0);
            $table->string('satuan', 20)->nullable();
            $table->string('condition', 20)->default('GOOD');
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('scanned_by')->nullable();
            $table->timestamp('scan_time')->nullable();
            $table->timestamps();

            $table->foreign('receiving_id')->references('id')->on('receivings')->onDelete('cascade');
            $table->foreign('shipment_item_id')->references('id')->on('shipment_items')->onDelete('set null');
            $table->index('receiving_id');
            $table->index('barcode');
            $table->index('kode_barang');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receiving_items');
    }
};
