<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sj_validations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('shipment_id');
            $table->unsignedBigInteger('validated_by')->nullable();
            $table->string('scan_code')->nullable();
            $table->string('status', 20)->default('IN_PROGRESS'); // IN_PROGRESS, COMPLETED, CANCELLED
            $table->text('notes')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->foreign('shipment_id')->references('id')->on('shipments')->onDelete('cascade');
            $table->foreign('validated_by')->references('id')->on('users')->nullOnDelete();
            $table->index('shipment_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sj_validations');
    }
};
