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
        $permissions = [
            ['name' => 'Approval Biaya View', 'slug' => 'approval.view', 'menu_group' => 'Sistem', 'icon' => 'shield', 'route' => 'approval.index', 'sort_order' => 490],
            ['name' => 'Approval Biaya Manage', 'slug' => 'approval.manage', 'menu_group' => 'Sistem', 'icon' => 'shield-edit', 'route' => 'approval.manage', 'sort_order' => 491],
            ['name' => 'Approval Biaya Submit', 'slug' => 'approval.submit', 'menu_group' => 'Biaya', 'icon' => 'send', 'route' => 'approval.submit', 'sort_order' => 492],
            ['name' => 'Approval Biaya Check', 'slug' => 'approval.check', 'menu_group' => 'Biaya', 'icon' => 'check', 'route' => 'approval.check', 'sort_order' => 493],
            ['name' => 'Approval Biaya Approve', 'slug' => 'approval.approve', 'menu_group' => 'Biaya', 'icon' => 'check', 'route' => 'approval.approve', 'sort_order' => 494],
            ['name' => 'Approval Biaya Reject', 'slug' => 'approval.reject', 'menu_group' => 'Biaya', 'icon' => 'x', 'route' => 'approval.reject', 'sort_order' => 495],
        ];
        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(['slug' => $permission['slug']], array_merge($permission, ['is_active' => true, 'created_at' => now(), 'updated_at' => now()]));
        }

        $rolePermissions = [
            'admin_master' => array_column($permissions, 'slug'),
            'staff_logistic' => ['approval.view', 'approval.manage', 'approval.submit', 'approval.check', 'approval.approve', 'approval.reject'],
            'admin_distirbusi' => ['approval.view', 'approval.manage', 'approval.submit', 'approval.check', 'approval.approve', 'approval.reject'],
            'admin_planner' => ['approval.view', 'approval.manage', 'approval.submit', 'approval.check', 'approval.approve', 'approval.reject'],
            'blc' => ['approval.view', 'approval.submit'],
            'bac' => ['approval.view', 'approval.check'],
            'rlh' => ['approval.view', 'approval.approve', 'approval.reject'],
        ];
        foreach ($rolePermissions as $roleSlug => $slugs) {
            $roleId = DB::table('roles')->where('slug', $roleSlug)->value('id');
            if (! $roleId) {
                continue;
            }
            $permissionIds = DB::table('permissions')->whereIn('slug', $slugs)->pluck('id');
            foreach ($permissionIds as $permissionId) {
                DB::table('role_permission')->updateOrInsert(['role_id' => $roleId, 'permission_id' => $permissionId], ['created_at' => now(), 'updated_at' => now()]);
            }
        }
        //
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $slugs = ['approval.view', 'approval.manage', 'approval.submit', 'approval.check', 'approval.approve', 'approval.reject'];
        $permissionIds = DB::table('permissions')->whereIn('slug', $slugs)->pluck('id');
        DB::table('role_permission')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->whereIn('slug', $slugs)->delete();
        //
    }
};
