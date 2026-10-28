<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Permission `sj_validation.approve` — planner memutuskan barang luar
     * rencana (setujui/tolak). Terpisah dari `sj_validation.extra` (yang
     * mencatat) supaya operator pelapor tidak otomatis menyetujui laporannya
     * sendiri.
     *
     * Grant awal: role yang boleh membuat/mengubah rencana kirim
     * (`rencana_kirim.create`) — keputusan barang fisik memang milik
     * pemilik rencana. Role baru menyentuh manual lewat UI.
     */
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'sj_validation.approve'],
            [
                'name' => 'Validasi Dokumen Setujui Barang Luar Rencana',
                'slug' => 'sj_validation.approve',
                'menu_group' => 'Validasi Dokumen',
                'icon' => 'package-check',
                'route' => 'sj_validation.approve',
                'sort_order' => 129,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $approveId = DB::table('permissions')->where('slug', 'sj_validation.approve')->value('id');
        if (! $approveId) {
            return;
        }

        $roleIds = DB::table('role_permission')->join(
            'permissions', 'permissions.id', '=', 'role_permission.permission_id'
        )->where('permissions.slug', 'rencana_kirim.create')->distinct()->pluck('role_permission.role_id');
        foreach ($roleIds as $roleId) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $approveId],
                ['created_at' => now(), 'updated_at' => now()]
            );
        }
    }

    /**
     * Forward-only: rollback tidak mencabut grant agar keputusan manual
     * admin lewat UI tetap bertahan.
     */
    public function down(): void
    {
        // no-op
    }
};
