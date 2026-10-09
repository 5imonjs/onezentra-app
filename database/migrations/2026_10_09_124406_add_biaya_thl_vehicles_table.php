<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('biaya_thl_vehicles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('biaya_thl_detail_id')->constrained('biaya_thl_details')->cascadeOnDelete();
            $table->string('no_sj', 50)->nullable();
            $table->string('nopol', 20)->nullable();
            $table->string('type', 50)->nullable();
            $table->unsignedInteger('order')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('biaya_thl_vehicles');
    }
};
