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
        Schema::table('opname_expired_waves', function (Blueprint $table) {
            $table->dropColumn(['validasi_expired_date', 'aksi_validasi', 'koreksi_note']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('opname_expired_waves', function (Blueprint $table) {
            $table->string('validasi_expired_date', 20)->nullable()->after('selisih_expired_date');
            $table->text('aksi_validasi')->nullable()->after('validasi_expired_date');
            $table->string('koreksi_note', 255)->nullable()->after('qty_koreksi_pcs');
        });
    }
};
