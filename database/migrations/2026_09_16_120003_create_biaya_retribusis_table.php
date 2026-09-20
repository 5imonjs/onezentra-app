<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('biaya_retribusis', function (Blueprint $table) {
            $table->id();
            $table->date('tanggal_pengajuan');
            $table->string('kode_depo', 50)->nullable();
            $table->string('nama_depo', 150)->nullable();
            $table->decimal('nominal_biaya', 15, 2)->default(0);
            $table->boolean('is_rfah_required')->default(false);
            $table->string('rfah_name', 150)->nullable();
            $table->string('approval_pengajuan', 50)->nullable();
            $table->unsignedBigInteger('created_by')->nullable();
            $table->string('status', 20)->default('draft');
            $table->timestamps();

            $table->foreign('created_by')->references('id')->on('users')->onDelete('set null');
            $table->index('kode_depo');
            $table->index('status');
            $table->index('tanggal_pengajuan');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('biaya_retribusis');
    }
};
