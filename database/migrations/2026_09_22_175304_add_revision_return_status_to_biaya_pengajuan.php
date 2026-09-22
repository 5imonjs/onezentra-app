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
        foreach (['biaya_thls', 'biaya_retribusis'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->string('revision_return_status', 20)->nullable()->after('revisi_reason');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach (['biaya_thls', 'biaya_retribusis'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropColumn('revision_return_status');
            });
        }
    }
};
