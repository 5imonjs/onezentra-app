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
        Schema::table('biaya_thl_details', function (Blueprint $table) {
            $table->string('no_surat_jalan', 50)->nullable()->after('biaya_thl_id');
        });
    }

    public function down(): void
    {
        Schema::table('biaya_thl_details', function (Blueprint $table) {
            $table->dropColumn('no_surat_jalan');
        });
    }
};
