<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('docks', function (Blueprint $table): void {
            $table->string('kode_depo', 20)->nullable()->after('code')->index();
            $table->string('nama_depo', 100)->nullable()->after('kode_depo')->index();
        });
    }

    public function down(): void
    {
        Schema::table('docks', function (Blueprint $table): void {
            $table->dropIndex(['kode_depo']);
            $table->dropIndex(['nama_depo']);
            $table->dropColumn(['kode_depo', 'nama_depo']);
        });
    }
};
