<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
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
                $table->foreignId('revised_by')->nullable()->after('rejection_reason')->constrained('users')->nullOnDelete();
                $table->timestamp('revised_at')->nullable()->after('revised_by');
                $table->text('revisi_reason')->nullable()->after('revised_at');
            });
        }

        DB::table('permissions')->updateOrInsert(
            ['slug' => 'approval.revise'],
            [
                'name' => 'Approval Biaya Revisi',
                'menu_group' => 'Biaya',
                'icon' => 'refresh',
                'route' => 'approval.revise',
                'sort_order' => 496,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $slugs = ['admin_master', 'staff_logistic', 'admin_distirbusi', 'admin_planner', 'bac', 'rlh'];
        $permissionId = DB::table('permissions')->where('slug', 'approval.revise')->value('id');
        foreach ($slugs as $roleSlug) {
            $roleId = DB::table('roles')->where('slug', $roleSlug)->value('id');
            if ($roleId && $permissionId) {
                DB::table('role_permission')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $permissionId],
                    ['created_at' => now(), 'updated_at' => now()]
                );
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $permissionId = DB::table('permissions')->where('slug', 'approval.revise')->value('id');
        if ($permissionId) {
            DB::table('role_permission')->where('permission_id', $permissionId)->delete();
            DB::table('permissions')->where('id', $permissionId)->delete();
        }

        foreach (['biaya_thls', 'biaya_retribusis'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropForeign(['revised_by']);
                $table->dropColumn(['revised_by', 'revised_at', 'revisi_reason']);
            });
        }
    }
};
