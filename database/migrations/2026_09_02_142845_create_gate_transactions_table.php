<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gate_transactions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('shipment_id');
            $table->string('gate_type', 20)->default('INBOUND');
            $table->string('plate_number', 50)->nullable();
            $table->string('driver_name', 100)->nullable();
            $table->string('sj_number', 50)->nullable();
            $table->string('container_number', 50)->nullable();
            $table->string('status', 20)->default('PENDING');
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('scanned_by')->nullable();
            $table->timestamp('scan_time')->nullable();
            $table->timestamps();

            $table->foreign('shipment_id')->references('id')->on('shipments')->onDelete('cascade');
            $table->index('shipment_id');
            $table->index('gate_type');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gate_transactions');
    }
};
