<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Koreksi opname kini butuh approval terpisah dari penghitungan (base
     * praktik: penyusun ≠ penyetuju). Permission approver dipisah
     * supaya bisa dicabut independen dari permission verifikasi lapangan —
     * admin cukup meng-centang lewat Roles & Permissions.
     */
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'opname.session.approve'],
            [
                'name' => 'Opname Sesi Approve',
                'slug' => 'opname.session.approve',
                'menu_group' => 'Opname',
                'icon' => 'check',
                'route' => 'opname_sessions.approve',
                'sort_order' => 476,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        // Grant awal mengikuti pola migrasi permission sesi: pemegang
        // opname.edit (level supervisor). Karena alur approvals wajib
        // PENYUSUN ≠ PENYETUJU, aturan runtime tetap memblokir siapapun yang
        // menghitung sesi untuk menyetujuinya sendiri.
        $editId = DB::table('permissions')->where('slug', 'opname.edit')->value('id');
        $approveId = DB::table('permissions')->where('slug', 'opname.session.approve')->value('id');

        if (! $editId || ! $approveId) {
            return;
        }

        $roleIds = DB::table('role_permission')->where('permission_id', $editId)->pluck('role_id');

        foreach ($roleIds as $roleId) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $approveId],
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
