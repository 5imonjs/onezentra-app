<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shipments', function (Blueprint $table) {
            $table->id();
            $table->string('rkh_number', 50)->nullable();
            $table->date('rkh_date')->nullable();
            $table->string('sj_number', 50)->nullable();
            $table->string('sj_date', 50)->nullable();
            $table->string('po_transporter', 100)->nullable();
            $table->string('driver_name', 100)->nullable();
            $table->string('vehicle_plate', 50)->nullable();
            $table->string('expedisi', 100)->nullable();
            $table->string('dock_number', 50)->nullable();
            $table->string('shipper_name', 200)->nullable();
            $table->text('shipper_address')->nullable();
            $table->string('shipper_phone', 50)->nullable();
            $table->string('destination_name', 200)->nullable();
            $table->text('destination_address')->nullable();
            $table->string('kode_depo', 20)->nullable();
            $table->string('nama_depo', 100)->nullable();
            $table->decimal('total_qty', 10, 2)->default(0);
            $table->string('status', 20)->default('DRAFT');
            $table->text('notes')->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('checked_in_at')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index('sj_number');
            $table->index('status');
            $table->index('rkh_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipments');
    }
};
