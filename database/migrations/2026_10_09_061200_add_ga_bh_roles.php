<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Tambah level/role GA (General Affairs — viewer luas) & BH (setara Admin
     * Planner) beserta permission-nya. Keputusan akses 2026-10-09.
     *
     * Migration ini melengkapi RoleSeeder/PermissionSeeder/UserSeeder untuk
     * DB yang sudah ada tanpa re-seed (seeder tidak boleh dijalankan tanpa
     * konfirmasi user).
     */
    public function up(): void
    {
        $roles = [
            ['slug' => 'ga', 'name' => 'GA', 'description' => 'Viewer semua modul (view only)'],
            ['slug' => 'bh', 'name' => 'BH', 'description' => 'BH (setara Admin Planner)'],
        ];
        foreach ($roles as $role) {
            DB::table('roles')->updateOrInsert(
                ['slug' => $role['slug']],
                array_merge($role, ['is_active' => true, 'created_at' => now(), 'updated_at' => now()])
            );
        }

        // GA: viewer luas — view-only semua modul, lintas depo. Slug turunan
        // (export/progress/cluster) ditulis eksplisit di sini agar hasil
        // migration identik dengan PermissionSeeder (drift 0).
        $this->attachPermissions('ga', [
            'dashboard.view',
            'depot.view_all',
            'rencana_kirim.view',
            'gate.view',
            'sj_validation.view',
            'receiving.view',
            'penerimaan.view',
            'npn.view',
            'standar_umur.view',
            'standarisasi.view',
            'biaya_thl.view',
            'biaya_thl.export',
            'biaya_retribusi.view',
            'biaya_retribusi.export',
            'reports.view',
            'reports.biaya_thl',
            'reports.biaya_retribusi',
            'opname.view',
            'opname.progress_all',
            'cluster_principal.view',
        ]);

        // BH: mirror penuh hak Admin Planner pada saat migrasi berjalan
        // (termasuk grant turunan export/progress), sesuai keputusan mirror
        // di akhir PermissionSeeder agar tidak drift.
        $bhId = DB::table('roles')->where('slug', 'bh')->value('id');
        $plannerId = DB::table('roles')->where('slug', 'admin_planner')->value('id');
        if ($bhId && $plannerId) {
            $plannerPermissionIds = DB::table('role_permission')
                ->where('role_id', $plannerId)
                ->pluck('permission_id');
            foreach ($plannerPermissionIds as $permissionId) {
                DB::table('role_permission')->updateOrInsert(
                    ['role_id' => $bhId, 'permission_id' => $permissionId],
                    ['created_at' => now(), 'updated_at' => now()]
                );
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $roleIds = DB::table('roles')->whereIn('slug', ['ga', 'bh'])->pluck('id');
        DB::table('role_permission')->whereIn('role_id', $roleIds)->delete();
        DB::table('roles')->whereIn('slug', ['ga', 'bh'])->delete();
    }

    private function attachPermissions(string $roleSlug, array $slugs): void
    {
        $roleId = DB::table('roles')->where('slug', $roleSlug)->value('id');
        if (! $roleId) {
            return;
        }
        $permissionIds = DB::table('permissions')->whereIn('slug', $slugs)->pluck('id');
        foreach ($permissionIds as $permissionId) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['created_at' => now(), 'updated_at' => now()]
            );
        }
    }
};
