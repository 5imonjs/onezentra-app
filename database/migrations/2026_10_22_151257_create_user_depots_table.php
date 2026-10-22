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
        Schema::create('user_depots', function (Blueprint $table) {
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('kode_depo', 20);
            $table->foreign('kode_depo')->references('kode_depo')->on('depot_settings')->cascadeOnDelete();
            $table->primary(['user_id', 'kode_depo']);
            $table->timestamp('assigned_at')->useCurrent();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('user_depots');
    }
};
