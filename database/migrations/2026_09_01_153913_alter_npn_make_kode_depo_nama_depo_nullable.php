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
        Schema::table('npn', function (Blueprint $table) {
            $table->string('kode_depo', 255)->nullable()->change();
            $table->string('nama_depo', 255)->nullable()->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('npn', function (Blueprint $table) {
            $table->string('kode_depo', 255)->nullable(false)->change();
            $table->string('nama_depo', 255)->nullable(false)->change();
        });
    }
};
