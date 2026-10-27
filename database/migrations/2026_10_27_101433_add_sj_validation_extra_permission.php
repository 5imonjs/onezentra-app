<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Permission baru `sj_validation.extra` — mencatat barang di luar rencana
     * kirim (deviation) pada sesi validasi SJ. Terpisah dari `sj_validation.
     * validate` supaya operator bisa dipercaya mencatat kenyataan fisik tanpa
     * otomatis boleh mengoreksi item rencana.
     *
     * Grant mengikuti `sj_validation.validate`: role yang sudah memvalidasi
     * tetap bisa mencatat deviasi — tidak ada akses yang hilang setelah
     * migrasi ini berjalan. Role baru cukup centang manual lewat UI.
     */
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'sj_validation.extra'],
            [
                'name' => 'Validasi Dokumen Barang Luar Rencana',
                'slug' => 'sj_validation.extra',
                'menu_group' => 'Validasi Dokumen',
                'icon' => 'package-plus',
                'route' => 'sj_validation.extra',
                'sort_order' => 127,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $validateId = DB::table('permissions')->where('slug', 'sj_validation.validate')->value('id');
        $extraId = DB::table('permissions')->where('slug', 'sj_validation.extra')->value('id');
        if (! $validateId || ! $extraId) {
            return;
        }

        $roleIds = DB::table('role_permission')->where('permission_id', $validateId)->pluck('role_id');
        foreach ($roleIds as $roleId) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $extraId],
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
