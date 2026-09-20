<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['biaya_thls', 'biaya_retribusis'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->foreignId('rlh_approved_by')->nullable()->after('checked_at')->constrained('users')->nullOnDelete();
                $table->timestamp('rlh_approved_at')->nullable()->after('rlh_approved_by');
            });
        }

        DB::table('permissions')->updateOrInsert(
            ['slug' => 'approval.rfah'],
            [
                'name' => 'Approval Biaya RFAH',
                'menu_group' => 'Biaya',
                'icon' => 'shield-check',
                'route' => 'approval.rfah',
                'sort_order' => 496,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
        $permissionId = DB::table('permissions')->where('slug', 'approval.rfah')->value('id');

        foreach (['admin_master', 'rfah'] as $roleSlug) {
            $roleId = DB::table('roles')->where('slug', $roleSlug)->value('id');
            if ($roleId && $permissionId) {
                DB::table('role_permission')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $permissionId],
                    ['created_at' => now(), 'updated_at' => now()]
                );
            }
        }
    }

    public function down(): void
    {
        foreach (['biaya_thls', 'biaya_retribusis'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropForeign(['rlh_approved_by']);
                $table->dropColumn(['rlh_approved_by', 'rlh_approved_at']);
            });
        }

        $slug = 'approval.rfah';
        $permissionId = DB::table('permissions')->where('slug', $slug)->value('id');
        if ($permissionId) {
            DB::table('role_permission')->where('permission_id', $permissionId)->delete();
            DB::table('permissions')->where('id', $permissionId)->delete();
        }
    }
};
