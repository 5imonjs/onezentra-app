<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Log aktivitas (audit trail) mencatat semua aksi API — termasuk aksi
     * mobile dan login/logout. Izin melihatnya dipisah dari `users.view`
     * supaya bisa diberikan hanya ke level tertentu lewat Roles & Permissions.
     *
     * Grant awal hanya ke admin_master agar permission bisa langsung diatur;
     * admin bisa mencabut/memberikan ke role lain dari halaman Role & Permission.
     */
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'activity.view'],
            [
                'name' => 'Lihat Log Aktivitas',
                'slug' => 'activity.view',
                'menu_group' => 'Pengaturan',
                'icon' => 'history',
                'route' => null,
                'description' => 'Melihat feed aktivitas lintas modul (termasuk aksi mobile dan login/logout). Diatur per role di halaman Role & Permission.',
                'sort_order' => 300,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $permissionId = DB::table('permissions')->where('slug', 'activity.view')->value('id');
        $adminRoleId = DB::table('roles')->where('slug', 'admin_master')->value('id');

        if ($permissionId && $adminRoleId) {
            $timestamp = now();
            DB::table('role_permission')->insertOrIgnore([
                'role_id' => $adminRoleId,
                'permission_id' => $permissionId,
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ]);
        }
    }

    public function down(): void
    {
        // Permission sengaja tidak dihapus agar grant manual tidak hilang.
    }
};
