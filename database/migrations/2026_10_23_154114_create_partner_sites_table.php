<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('partner_sites', function (Blueprint $table): void {
            $table->string('kode_ps', 20)->primary();
            $table->string('kode_depo', 20);
            $table->string('nama_ps', 150);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->foreign('kode_depo')
                ->references('kode_depo')
                ->on('depot_settings')
                ->restrictOnDelete();
            $table->index(['kode_depo', 'is_active']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('partner_sites');
    }
};
