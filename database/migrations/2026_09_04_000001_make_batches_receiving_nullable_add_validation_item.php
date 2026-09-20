<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            $table->unsignedBigInteger('receiving_id')->nullable()->change();
            $table->unsignedBigInteger('sj_validation_item_id')->nullable()->after('receiving_id');
            $table->index('sj_validation_item_id');
        });
    }

    public function down(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            $table->dropIndex(['sj_validation_item_id']);
            $table->dropColumn('sj_validation_item_id');
            $table->unsignedBigInteger('receiving_id')->nullable(false)->change();
        });
    }
};
