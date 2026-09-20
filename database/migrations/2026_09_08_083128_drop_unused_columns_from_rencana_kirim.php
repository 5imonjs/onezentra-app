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
        Schema::table('rencana_kirim', function (Blueprint $table) {
            $table->dropColumn(['rkh_number', 'no_dokumen_date', 'dock_number']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('rencana_kirim', function (Blueprint $table) {
            $table->string('rkh_number', 50)->nullable()->after('rkh_date');
            $table->string('no_dokumen_date', 50)->nullable()->after('no_dokumen');
            $table->string('dock_number', 50)->nullable()->after('expedisi');
        });
    }
};
