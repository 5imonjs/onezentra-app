<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Riwayat aktivitas harus bisa dilihat semua user yang login agar setiap
     * orang bisa memeriksa siapa yang membuat/mengubah dokumen (termasuk aksi
     * dari mobile). Sebelumnya izin ini hanya diberikan ke admin_master,
     * sehingga panel & halaman riwayat tidak muncul untuk peran lain.
     *
     * Permission tetap dipertahankan sebagai slug `activity.view` supaya admin
     * masih bisa mencabutnya per role lewat halaman Role & Permission.
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
                'description' => 'Melihat riwayat aktivitas lintas modul (termasuk aksi mobile dan login/logout).',
                'sort_order' => 300,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $permissionId = DB::table('permissions')->where('slug', 'activity.view')->value('id');
        if (! $permissionId) {
            return;
        }

        $timestamp = now();
        $roleIds = DB::table('roles')->pluck('id')->all();
        $rows = array_map(fn (int $roleId): array => [
            'role_id' => $roleId,
            'permission_id' => $permissionId,
            'created_at' => $timestamp,
            'updated_at' => $timestamp,
        ], $roleIds);

        foreach (array_chunk($rows, 500) as $batch) {
            DB::table('role_permission')->insertOrIgnore($batch);
        }

        // Permission user di-cache; bersihkan agar grant langsung berlaku.
        DB::table('users')->pluck('id')->each(function (int $userId): void {
            Cache::forget("user:{$userId}:permissions");
        });
    }

    public function down(): void
    {
        // Grant sengaja tidak dicabut agar keputusan admin tidak hilang.
    }
};
