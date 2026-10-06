<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Komposisi sumber tiap baris wave ({sj, import}): penanda visual agar
     * operator bisa membedakan data murni penerimaan sistem vs hasil import.
     */
    public function up(): void
    {
        Schema::table('opname_expired_waves', function (Blueprint $table) {
            $table->json('source_mix')->nullable()->after('batch_numbers');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('opname_expired_waves', function (Blueprint $table) {
            $table->dropColumn('source_mix');
        });
    }
};
