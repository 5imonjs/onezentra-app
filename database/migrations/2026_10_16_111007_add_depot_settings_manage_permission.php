<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Permission `depot_settings.manage` (Ubah Setting Depo) hanya untuk
     * admin_master. PUT /api/v1/depot-settings/{kodeDepo} sebelumnya hanya
     * di-gate level di controller — efektif, tetapi melanggar invarian
     * codebase (AuthorizationInventoryTest: semua endpoint mutating wajib
     * punya gate permission di route). Controller tetap meng-gate ulang
     * level, jadi grant manual slug ini ke role lain tetap 403.
     */
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'depot_settings.manage'],
            [
                'name' => 'Ubah Setting Depo',
                'slug' => 'depot_settings.manage',
                'menu_group' => 'Sistem',
                'icon' => 'building-office',
                'route' => null,
                'sort_order' => 436,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $permissionId = DB::table('permissions')->where('slug', 'depot_settings.manage')->value('id');
        $roleId = DB::table('roles')->where('slug', 'admin_master')->value('id');
        if ($permissionId && $roleId) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['created_at' => now(), 'updated_at' => now()]
            );
        }
    }

    /**
     * Grant forward-only: rollback tidak mencabut agar tak hapus grant manual
     * yang diberikan admin lewat UI setelah migrasi ini berjalan.
     */
    public function down(): void
    {
        // no-op: grant forward-only, rollback tidak mencabut.
    }
};
