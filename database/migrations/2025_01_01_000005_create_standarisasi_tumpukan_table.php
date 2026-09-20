<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('standarisasi_tumpukan', function (Blueprint $table) {
            $table->id();
            $table->string('BOSnetszProductId', 50)->nullable();
            $table->string('szBarcode', 100)->nullable()->index();
            $table->string('szBarcodeSekunder', 100)->nullable();
            $table->string('szBarcodeTersier', 100)->nullable();
            $table->string('szNickName', 50)->nullable();
            $table->string('szStatus', 50)->nullable();
            $table->integer('tier')->nullable();
            $table->integer('tinggi_tumpukan')->nullable();
            $table->string('status', 255)->default('approved');
            $table->unsignedBigInteger('requested_by')->nullable();
            $table->string('requested_by_email', 255)->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->string('approved_by_email', 255)->nullable();
            $table->string('kode_depo', 50)->nullable()->index();
            $table->string('nama_depo', 150)->nullable();
            $table->integer('total_tier_tinggi')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('standarisasi_tumpukan');
    }
};
