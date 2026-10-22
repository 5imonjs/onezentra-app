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
        Schema::table('depot_settings', function (Blueprint $table) {
            $table->string('region_id', 20)->nullable()->after('kode_depo');
            $table->index('region_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('depot_settings', function (Blueprint $table) {
            $table->dropIndex(['region_id']);
            $table->dropColumn('region_id');
        });
    }
};
