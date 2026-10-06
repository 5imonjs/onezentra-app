<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Jejak cara identifikasi batch saat verifikasi: scan kamera vs
     * identifikasi manual (label rusak). Base praktik: scan dulu, input
     * qty kemudian; manual hanya fallback yang tercatat.
     */
    public function up(): void
    {
        Schema::table('opname_expired_session_items', function (Blueprint $table) {
            $table->string('verified_via', 10)->nullable()->after('verified_by');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('opname_expired_session_items', function (Blueprint $table) {
            $table->dropColumn('verified_via');
        });
    }
};
