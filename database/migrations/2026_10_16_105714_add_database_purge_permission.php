<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Permission `database.purge` (Reset Data Operasional) hanya untuk
     * admin_master: level master melewati RBAC dan memegang semua permission
     * aktif, sedangkan controller AdminDatabaseController meng-gate ulang
     * level === admin_master — jadi walau slug ini dicentang ke role lain
     * lewat UI, endpoint tetap 403 untuk non-master.
     */
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'database.purge'],
            [
                'name' => 'Reset Data Operasional',
                'slug' => 'database.purge',
                'menu_group' => 'Sistem',
                'icon' => 'trash',
                'route' => 'admin.database',
                'sort_order' => 435,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $permissionId = DB::table('permissions')->where('slug', 'database.purge')->value('id');
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
