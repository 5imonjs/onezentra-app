<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Sesi opname (penugasan + verifikasi lapangan) sebelumnya menumpang slug
     * generik `opname.view/create/edit` yang juga menggerakkan monitoring wave
     * (generate, threshold). Akibatnya semua pemegang `opname.view` — termasuk
     * viewer murni — melihat menu lapangan meski tak bisa berbuat apa pun.
     *
     * Permission sesi dipisah supaya bisa dicabut independen. Grant mengikuti
     * kemampuan menjalankan sesi: view/create mengikuti perubahan opname.create,
     * edit mengikuti opname.edit; viewer murni (opname.view saja) SENGAJA tidak
     * diberi akses sesi. Role baru cukup dicentang manual lewat Roles & Permissions.
     */
    public function up(): void
    {
        $permissions = [
            ['slug' => 'opname.session.view', 'name' => 'Opname Sesi View', 'icon' => 'clipboard', 'route' => 'opname_sessions.index', 'sort_order' => 473],
            ['slug' => 'opname.session.create', 'name' => 'Opname Sesi Buat', 'icon' => 'plus', 'route' => 'opname_sessions.store', 'sort_order' => 474],
            ['slug' => 'opname.session.edit', 'name' => 'Opname Sesi Verifikasi', 'icon' => 'edit', 'route' => 'opname_sessions.start', 'sort_order' => 475],
        ];

        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(
                ['slug' => $permission['slug']],
                [
                    'name' => $permission['name'],
                    'slug' => $permission['slug'],
                    'menu_group' => 'Opname',
                    'icon' => $permission['icon'],
                    'route' => $permission['route'],
                    'sort_order' => $permission['sort_order'],
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
        }

        $createId = DB::table('permissions')->where('slug', 'opname.create')->value('id');
        $editId = DB::table('permissions')->where('slug', 'opname.edit')->value('id');

        $createRoleIds = $createId
            ? DB::table('role_permission')->where('permission_id', $createId)->pluck('role_id')
            : collect();
        $editRoleIds = $editId
            ? DB::table('role_permission')->where('permission_id', $editId)->pluck('role_id')
            : collect();

        $newIds = DB::table('permissions')
            ->whereIn('slug', ['opname.session.view', 'opname.session.create', 'opname.session.edit'])
            ->pluck('id', 'slug');

        $grants = [
            'opname.session.view' => $createRoleIds->merge($editRoleIds)->unique(),
            'opname.session.create' => $createRoleIds,
            'opname.session.edit' => $editRoleIds,
        ];

        foreach ($grants as $slug => $roleIds) {
            $permissionId = $newIds[$slug] ?? null;
            if (! $permissionId) {
                continue;
            }

            foreach ($roleIds as $roleId) {
                DB::table('role_permission')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $permissionId],
                    ['created_at' => now(), 'updated_at' => now()]
                );
            }
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
