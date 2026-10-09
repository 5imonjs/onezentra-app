<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Pindah dokumen antar depo sebelumnya hanya boleh level admin_master
     * (hardcode di RencanaKirimController::update) — kaku: level lain yang
     * butuh tidak bisa diberi tanpa ubah kode.
     *
     * Permission baru `depot.move` menggantikannya: bisa di on/off per role
     * lewat Roles & Permissions. Grant awal = admin_master saja, sehingga
     * perilaku existing tidak berubah setelah migrasi ini.
     */
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'depot.move'],
            [
                'name' => 'Pindah Depo Dokumen',
                'slug' => 'depot.move',
                'menu_group' => 'Umum',
                'icon' => 'arrows-right-left',
                'route' => null,
                'sort_order' => 21,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $permissionId = DB::table('permissions')->where('slug', 'depot.move')->value('id');
        $roleId = DB::table('roles')->where('slug', 'admin_master')->value('id');
        if (! $permissionId || ! $roleId) {
            return;
        }

        DB::table('role_permission')->updateOrInsert(
            ['role_id' => $roleId, 'permission_id' => $permissionId],
            ['created_at' => now(), 'updated_at' => now()]
        );
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
