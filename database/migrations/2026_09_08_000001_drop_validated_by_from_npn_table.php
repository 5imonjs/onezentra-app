<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('npn', function (Blueprint $table) {
            $table->dropColumn('validated_by');
        });
    }

    public function down(): void
    {
        Schema::table('npn', function (Blueprint $table) {
            $table->unsignedBigInteger('validated_by')->nullable()->after('nama_depo');
        });
    }
};
