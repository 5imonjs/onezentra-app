<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('biaya_thl_details', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('biaya_thl_id');
            $table->string('nama_thl', 150)->nullable();
            $table->string('driver_name', 150)->nullable();
            $table->string('nopol_kendaraan', 20)->nullable();
            $table->string('type_kendaraan', 50)->nullable();
            $table->decimal('kubikasi', 10, 2)->default(0);
            $table->string('droppoint', 100)->nullable();
            $table->string('posisi', 50)->nullable();
            $table->datetime('jam_datang')->nullable();
            $table->datetime('jam_pulang')->nullable();
            $table->decimal('nominal_biaya', 15, 2)->default(0);
            $table->boolean('kendaraan_tambahan')->default(false);
            $table->integer('order')->default(0);
            $table->timestamps();

            $table->foreign('biaya_thl_id')->references('id')->on('biaya_thls')->onDelete('cascade');
            $table->index('biaya_thl_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('biaya_thl_details');
    }
};
