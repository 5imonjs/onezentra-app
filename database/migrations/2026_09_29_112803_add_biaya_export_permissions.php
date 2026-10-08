<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * The web app gates the Export buttons on `biaya_thl.export` and
     * `biaya_retribusi.export`, but those slugs never existed in the
     * permissions table, so the buttons never rendered for anyone — even
     * admin. Export used to be reachable with just `*.view` (the old route
     * middleware), so every role holding the view permission is granted the
     * export permission too: no access is lost, and the route middleware can
     * be tightened to `*.export` to match what the UI shows.
     */
    public function up(): void
    {
        $permissions = [
            ['name' => 'Biaya THL Export', 'slug' => 'biaya_thl.export', 'menu_group' => 'Biaya THL', 'icon' => 'download', 'route' => 'biaya_thl.export', 'sort_order' => 486],
            ['name' => 'Biaya Retribusi Export', 'slug' => 'biaya_retribusi.export', 'menu_group' => 'Biaya Retribusi', 'icon' => 'download', 'route' => 'biaya_retribusi.export', 'sort_order' => 487],
        ];
        foreach ($permissions as $permission) {
            DB::table('permissions')->updateOrInsert(
                ['slug' => $permission['slug']],
                array_merge($permission, ['is_active' => true, 'created_at' => now(), 'updated_at' => now()])
            );
        }

        // Export follows view: grant it to every role that can already see
        // the module — the same access the old `permission:*.view` route
        // allowed. Future roles get ticked manually in Roles & Permissions.
        $pairs = [
            'biaya_thl.view' => 'biaya_thl.export',
            'biaya_retribusi.view' => 'biaya_retribusi.export',
        ];
        foreach ($pairs as $viewSlug => $exportSlug) {
            $viewPermissionId = DB::table('permissions')->where('slug', $viewSlug)->value('id');
            $exportPermissionId = DB::table('permissions')->where('slug', $exportSlug)->value('id');
            if (! $viewPermissionId || ! $exportPermissionId) {
                continue;
            }

            $roleIds = DB::table('role_permission')
                ->where('permission_id', $viewPermissionId)
                ->pluck('role_id');
            foreach ($roleIds as $roleId) {
                DB::table('role_permission')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $exportPermissionId],
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
