<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('biaya_retribusi_details', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('biaya_retribusi_id');
            $table->unsignedBigInteger('biaya_thl_id')->nullable();
            $table->unsignedBigInteger('biaya_thl_detail_id')->nullable();
            $table->string('nopol_kendaraan', 20)->nullable();
            $table->string('type_kendaraan', 50)->nullable();
            $table->string('no_surat_jalan', 50)->nullable();
            $table->decimal('nominal_biaya', 15, 2)->default(0);
            $table->integer('order')->default(0);
            $table->timestamps();

            $table->foreign('biaya_retribusi_id')->references('id')->on('biaya_retribusis')->onDelete('cascade');
            $table->foreign('biaya_thl_id')->references('id')->on('biaya_thls')->onDelete('set null');
            $table->foreign('biaya_thl_detail_id')->references('id')->on('biaya_thl_details')->onDelete('set null');
            $table->index('biaya_retribusi_id');
            $table->index('biaya_thl_id');
            $table->index('biaya_thl_detail_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('biaya_retribusi_details');
    }
};
