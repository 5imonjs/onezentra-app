<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tabel lama menyimpan field BOSnet secara denormal (BOSnetszProductId,
     * szBarcode, szNickName, ...) sehingga tidak kompatibel dengan sistem baru
     * yang memakai FK `npn_id`. Buang dan buat ulang dengan struktur normal.
     */
    public function up(): void
    {
        Schema::dropIfExists('standarisasi_tumpukan');

        Schema::create('standarisasi_tumpukan', function (Blueprint $table) {
            $table->id();
            $table->foreignId('npn_id')->nullable()->constrained('npn')->nullOnDelete()->index();
            $table->integer('tier')->nullable();
            $table->integer('tinggi_tumpukan')->nullable();
            $table->integer('total_tier_tinggi')->nullable();
            $table->string('status', 20)->default('pending');
            $table->unsignedBigInteger('requested_by')->nullable();
            $table->string('requested_by_email', 255)->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->string('approved_by_email', 255)->nullable();
            $table->string('kode_depo', 50)->nullable()->index();
            $table->string('nama_depo', 150)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        throw new LogicException('irreversible: restore dari backup');
    }
};
