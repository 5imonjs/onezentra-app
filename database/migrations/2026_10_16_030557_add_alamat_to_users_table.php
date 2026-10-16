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
        Schema::table('users', function (Blueprint $table) {
            // Alamat domisili pribadi user (bukan alamat depo operasional —
            // itu milik depot_settings per kode_depo). Nullable agar baris
            // lama tetap valid tanpa backfill.
            $table->text('alamat')->nullable()->after('full_name');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('alamat');
        });
    }
};
