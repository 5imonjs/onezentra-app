<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('biaya_retribusi_details', function (Blueprint $table) {
            $table->decimal('qty_zak', 15, 2)->default(0)->after('no_surat_jalan');
            $table->decimal('qty_crt', 15, 2)->default(0)->after('qty_zak');
        });
    }

    public function down(): void
    {
        Schema::table('biaya_retribusi_details', function (Blueprint $table) {
            $table->dropColumn(['qty_zak', 'qty_crt']);
        });
    }
};
