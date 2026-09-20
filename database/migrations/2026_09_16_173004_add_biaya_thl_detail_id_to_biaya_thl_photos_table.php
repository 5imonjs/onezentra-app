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
        Schema::table('biaya_thl_photos', function (Blueprint $table) {
            $table->unsignedBigInteger('biaya_thl_detail_id')->nullable()->after('biaya_thl_id');
            $table->foreign('biaya_thl_detail_id')->references('id')->on('biaya_thl_details')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('biaya_thl_photos', function (Blueprint $table) {
            $table->dropForeign(['biaya_thl_detail_id']);
            $table->dropColumn('biaya_thl_detail_id');
        });
    }
};
