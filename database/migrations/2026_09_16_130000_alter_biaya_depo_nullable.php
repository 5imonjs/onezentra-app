<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('biaya_thls', function (Blueprint $table) {
            $table->string('kode_depo', 50)->nullable()->change();
            $table->string('nama_depo', 150)->nullable()->change();
        });
        Schema::table('biaya_retribusis', function (Blueprint $table) {
            $table->string('kode_depo', 50)->nullable()->change();
            $table->string('nama_depo', 150)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('biaya_thls', function (Blueprint $table) {
            $table->string('kode_depo', 50)->nullable(false)->change();
            $table->string('nama_depo', 150)->nullable(false)->change();
        });
        Schema::table('biaya_retribusis', function (Blueprint $table) {
            $table->string('kode_depo', 50)->nullable(false)->change();
            $table->string('nama_depo', 150)->nullable(false)->change();
        });
    }
};
