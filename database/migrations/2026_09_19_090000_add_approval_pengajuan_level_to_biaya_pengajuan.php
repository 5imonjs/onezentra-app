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
                $table->string('approval_pengajuan_level')->nullable()->after('approval_pengajuan');
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
                $table->dropColumn('approval_pengajuan_level');
            });
        }
    }
};
