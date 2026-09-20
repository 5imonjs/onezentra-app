<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receiving_items', function (Blueprint $table) {
            $table->unsignedBigInteger('sj_validation_item_id')->nullable()->after('receiving_id');
            $table->date('expired_date')->nullable()->after('condition');
            $table->foreign('sj_validation_item_id')->references('id')->on('sj_validation_items')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('receiving_items', function (Blueprint $table) {
            $table->dropForeign(['sj_validation_item_id']);
            $table->dropColumn(['sj_validation_item_id', 'expired_date']);
        });
    }
};
