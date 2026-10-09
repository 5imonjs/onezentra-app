<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `depot.view_all` adalah saklar scoping GLOBAL (`User::isDepotScoped`),
     * dipakai di semua modul. Memberikannya ke BLC (untuk approve standarisasi
     * lintas depo) membuat BLC melihat semua depo di mana-mana — termasuk
     * filter depo di dashboard utama.
     *
     * Permission sempit `standarisasi.view_all` menggantikannya: hanya
     * melewati scoping di modul standarisasi. Migrasi ini:
     *  - membuat permission tersebut,
     *  - memberikannya ke admin_master (agar tetap full) dan blc,
     *  - mencabut `depot.view_all` dari blc.
     *
     * Seeder tetap menjadi sumber kebenaran (hasilnya identik dengan migrasi
     * ini), jadi re-seed tidak menghasilkan drift.
     */
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'standarisasi.view_all'],
            [
                'name' => 'Standarisasi Lintas Depo',
                'slug' => 'standarisasi.view_all',
                'menu_group' => 'Standarisasi Tumpukan',
                'icon' => 'globe',
                'route' => null,
                'sort_order' => 340,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $permissionId = DB::table('permissions')->where('slug', 'standarisasi.view_all')->value('id');
        if ($permissionId) {
            foreach (['admin_master', 'blc'] as $roleSlug) {
                $roleId = DB::table('roles')->where('slug', $roleSlug)->value('id');
                if (! $roleId) {
                    continue;
                }

                DB::table('role_permission')->updateOrInsert(
                    ['role_id' => $roleId, 'permission_id' => $permissionId],
                    ['created_at' => now(), 'updated_at' => now()]
                );
            }
        }

        $blcId = DB::table('roles')->where('slug', 'blc')->value('id');
        $depotViewAllId = DB::table('permissions')->where('slug', 'depot.view_all')->value('id');
        if ($blcId && $depotViewAllId) {
            DB::table('role_permission')
                ->where('role_id', $blcId)
                ->where('permission_id', $depotViewAllId)
                ->delete();
        }
    }

    /**
     * Grant forward-only: rollback tidak mencabut/mengembalikan agar tak
     * menghapus grant manual yang diberikan admin lewat UI setelahnya.
     */
    public function down(): void
    {
        // no-op.
    }
};
