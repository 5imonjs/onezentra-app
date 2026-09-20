<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('standar_umur_produk', function (Blueprint $table) {
            $table->dropColumn('supplier');
        });
    }

    public function down(): void
    {
        Schema::table('standar_umur_produk', function (Blueprint $table) {
            $table->string('supplier', 255)->nullable()->after('made_in');
        });
    }
};
