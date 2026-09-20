<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shipment_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('shipment_id');
            $table->integer('item_number')->default(1);
            $table->string('kode_barang', 50)->nullable();
            $table->string('nama_barang', 200)->nullable();
            $table->decimal('jumlah', 10, 2)->default(0);
            $table->string('satuan', 20)->nullable();
            $table->text('keterangan')->nullable();
            $table->decimal('received_qty', 10, 2)->default(0);
            $table->timestamps();

            $table->foreign('shipment_id')->references('id')->on('shipments')->onDelete('cascade');
            $table->index('shipment_id');
            $table->index('kode_barang');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipment_items');
    }
};
