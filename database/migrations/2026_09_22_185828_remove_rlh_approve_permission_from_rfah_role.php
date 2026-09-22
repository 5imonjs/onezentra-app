<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $roleId = DB::table('roles')->where('slug', 'rfah')->value('id');
        $permissionId = DB::table('permissions')->where('slug', 'approval.approve')->value('id');

        if ($roleId && $permissionId) {
            DB::table('role_permission')
                ->where('role_id', $roleId)
                ->where('permission_id', $permissionId)
                ->delete();
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $roleId = DB::table('roles')->where('slug', 'rfah')->value('id');
        $permissionId = DB::table('permissions')->where('slug', 'approval.approve')->value('id');

        if ($roleId && $permissionId) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['created_at' => now(), 'updated_at' => now()]
            );
        }
    }
};
