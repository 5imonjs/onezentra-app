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
                $table->foreignId('submitted_by')->nullable()->after('approval_pengajuan')->constrained('users')->nullOnDelete();
                $table->timestamp('submitted_at')->nullable()->after('submitted_by');
                $table->foreignId('checked_by')->nullable()->after('submitted_at')->constrained('users')->nullOnDelete();
                $table->timestamp('checked_at')->nullable()->after('checked_by');
                $table->foreignId('approved_by')->nullable()->after('checked_at')->constrained('users')->nullOnDelete();
                $table->timestamp('approved_at')->nullable()->after('approved_by');
                $table->foreignId('rejected_by')->nullable()->after('approved_at')->constrained('users')->nullOnDelete();
                $table->timestamp('rejected_at')->nullable()->after('rejected_by');
                $table->text('rejection_reason')->nullable()->after('rejected_at');
            });
        }
        Schema::table('biaya_thls', function (Blueprint $table) {
            //
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        foreach (['biaya_thls', 'biaya_retribusis'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropForeign(['submitted_by']);
                $table->dropForeign(['checked_by']);
                $table->dropForeign(['approved_by']);
                $table->dropForeign(['rejected_by']);
                $table->dropColumn([
                    'submitted_by', 'submitted_at', 'checked_by', 'checked_at',
                    'approved_by', 'approved_at', 'rejected_by', 'rejected_at', 'rejection_reason',
                ]);
            });
        }
        Schema::table('biaya_thls', function (Blueprint $table) {
            //
        });
    }
};
