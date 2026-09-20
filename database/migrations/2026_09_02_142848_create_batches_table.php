<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('batches', function (Blueprint $table) {
            $table->id();
            $table->string('batch_number', 50)->unique();
            $table->unsignedBigInteger('receiving_id');
            $table->string('barcode_label', 100)->nullable();
            $table->text('items_json')->nullable();
            $table->string('status', 20)->default('ACTIVE');
            $table->timestamps();

            $table->foreign('receiving_id')->references('id')->on('receivings')->onDelete('cascade');
            $table->index('receiving_id');
            $table->index('batch_number');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('batches');
    }
};
