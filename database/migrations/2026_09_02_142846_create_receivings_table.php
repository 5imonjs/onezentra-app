<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('receivings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('shipment_id');
            $table->unsignedBigInteger('dock_id')->nullable();
            $table->unsignedBigInteger('gate_transaction_id')->nullable();
            $table->string('status', 20)->default('PENDING');
            $table->decimal('total_expected_qty', 10, 2)->default(0);
            $table->decimal('total_received_qty', 10, 2)->default(0);
            $table->string('dock_status', 20)->nullable();
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('checked_by')->nullable();
            $table->timestamp('actual_arrival_time')->nullable();
            $table->timestamp('actual_start_time')->nullable();
            $table->timestamp('actual_end_time')->nullable();
            $table->timestamps();

            $table->foreign('shipment_id')->references('id')->on('shipments')->onDelete('cascade');
            $table->foreign('dock_id')->references('id')->on('docks')->onDelete('set null');
            $table->foreign('gate_transaction_id')->references('id')->on('gate_transactions')->onDelete('set null');
            $table->index('shipment_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('receivings');
    }
};
