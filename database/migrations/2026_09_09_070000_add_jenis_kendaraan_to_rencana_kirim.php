<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rencana_kirim', function (Blueprint $table) {
            $table->string('jenis_kendaraan', 50)->nullable()->after('nopol');
        });
    }

    public function down(): void
    {
        Schema::table('rencana_kirim', function (Blueprint $table) {
            $table->dropColumn('jenis_kendaraan');
        });
    }
};
