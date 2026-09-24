<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('retribusi_rates', function (Blueprint $table) {
            $table->id();
            $table->string('kode_depo', 20)->unique();
            $table->string('nama_depo', 100)->nullable();
            $table->string('mode', 20)->default('borongan');
            $table->decimal('rate_zak', 15, 2)->default(0);
            $table->decimal('rate_crt', 15, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('retribusi_rates');
    }
};
