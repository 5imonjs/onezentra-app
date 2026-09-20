<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shipment_items', function (Blueprint $table) {
            $table->unsignedBigInteger('npn_id')->nullable()->after('shipment_id');
            $table->foreign('npn_id')->references('id')->on('npn')->nullOnDelete();
            $table->index('npn_id');
        });
    }

    public function down(): void
    {
        Schema::table('shipment_items', function (Blueprint $table) {
            $table->dropForeign(['npn_id']);
            $table->dropIndex(['npn_id']);
            $table->dropColumn('npn_id');
        });
    }
};
