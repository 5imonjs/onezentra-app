<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Progres opname per depo boleh dilihat semua depo (chart dashboard):
     * grant `opname.progress_all` mengikuti `opname.view` — role yang sudah
     * bisa melihat opname tetap bisa, tidak ada akses yang hilang.
     * Role baru cukup centang manual lewat UI.
     */
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'opname.progress_all'],
            [
                'name' => 'Opname Progres Semua Depo',
                'slug' => 'opname.progress_all',
                'menu_group' => 'Opname',
                'icon' => 'chart',
                'route' => 'opname_expired.progress',
                'sort_order' => 472,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $viewId = DB::table('permissions')->where('slug', 'opname.view')->value('id');
        $progressId = DB::table('permissions')->where('slug', 'opname.progress_all')->value('id');
        if (! $viewId || ! $progressId) {
            return;
        }

        $roleIds = DB::table('role_permission')->where('permission_id', $viewId)->pluck('role_id');
        foreach ($roleIds as $roleId) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $progressId],
                ['created_at' => now(), 'updated_at' => now()]
            );
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $permissionIds = DB::table('permissions')->where('slug', 'opname.progress_all')->pluck('id');
        DB::table('role_permission')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->where('slug', 'opname.progress_all')->delete();
    }
};
