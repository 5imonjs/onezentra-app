<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('biaya_thls', function (Blueprint $table) {
            $table->unsignedBigInteger('biaya_retribusi_detail_id')->nullable()->after('id');
            $table->foreign('biaya_retribusi_detail_id')->references('id')->on('biaya_retribusi_details')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('biaya_thls', function (Blueprint $table) {
            $table->dropForeign(['biaya_retribusi_detail_id']);
            $table->dropColumn('biaya_retribusi_detail_id');
        });
    }
};
