<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Value kanonik 'EXPIRED_TIDAK_STANDAR' = 21 karakter > varchar(20).
     * Perlebar agar vocab condition kanonik (FISIK_*) bisa tersimpan penuh.
     */
    public function up(): void
    {
        Schema::table('receiving_items', function (Blueprint $table) {
            $table->string('condition', 32)->default('FISIK_BAGUS')->change();
        });

        Schema::table('sj_validation_items', function (Blueprint $table) {
            $table->string('condition', 32)->default('FISIK_BAGUS')->change();
        });
    }

    public function down(): void
    {
        Schema::table('receiving_items', function (Blueprint $table) {
            $table->string('condition', 20)->default('GOOD')->change();
        });

        Schema::table('sj_validation_items', function (Blueprint $table) {
            $table->string('condition', 20)->default('GOOD')->change();
        });
    }
};
