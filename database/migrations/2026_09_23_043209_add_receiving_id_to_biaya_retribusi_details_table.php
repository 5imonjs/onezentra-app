<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('biaya_retribusi_details', function (Blueprint $table) {
            $table->unsignedBigInteger('receiving_id')->nullable()->after('biaya_thl_detail_id');
            $table->foreign('receiving_id')->references('id')->on('receivings')->onDelete('set null');
            $table->index('receiving_id');
        });
    }

    public function down(): void
    {
        Schema::table('biaya_retribusi_details', function (Blueprint $table) {
            $table->dropForeign(['receiving_id']);
            $table->dropIndex(['receiving_id']);
            $table->dropColumn('receiving_id');
        });
    }
};
