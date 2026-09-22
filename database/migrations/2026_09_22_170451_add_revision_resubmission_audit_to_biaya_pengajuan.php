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
                $table->foreignId('resubmitted_by')->nullable()->after('revisi_reason')->constrained('users')->nullOnDelete();
                $table->timestamp('resubmitted_at')->nullable()->after('resubmitted_by');
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
                $table->dropForeign(['resubmitted_by']);
                $table->dropColumn(['resubmitted_by', 'resubmitted_at']);
            });
        }
    }
};
