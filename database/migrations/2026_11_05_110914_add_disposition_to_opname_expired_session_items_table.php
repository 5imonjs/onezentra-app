<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Disposisi tiap batch hasil opname (keputusan tindak lanjut yang
     * menjadi dasar approve): perhitungan fisik tanpa keputusan tindak
     * lanjut tidak menuntut siklus opname expired.
     */
    public function up(): void
    {
        Schema::table('opname_expired_session_items', function (Blueprint $table) {
            $table->string('disposition', 16)->nullable()->after('condition');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('opname_expired_session_items', function (Blueprint $table) {
            $table->dropColumn('disposition');
        });
    }
};
