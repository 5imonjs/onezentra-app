<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Pembatalan sesi validasi (membatalkan satu PO transporter beserta seluruh
     * itemnya) sebelumnya hanya dijaga `sj_validation.edit` — permission
     * generik yang juga mengizinkan penyuntingan lain. Akibatnya siapa pun yang
     * boleh edit otomatis bisa membatalkan sesi tanpa bisa dibatalkan kembali.
     *
     * Permission baru `sj_validation.cancel` khusus untuk aksi terminal ini,
     * terpisah dari edit supaya bisa dicabut sendiri di Roles & Permissions.
     *
     * Grant mengikuti `sj_validation.edit`: role yang sebelumnya sudah bisa
     * membatalkan tetap bisa — tidak ada akses yang hilang setelah migrasi ini.
     * Role baru cukup centang manual lewat UI.
     */
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'sj_validation.cancel'],
            [
                'name' => 'Validasi Dokumen Batalkan',
                'slug' => 'sj_validation.cancel',
                'menu_group' => 'Validasi Dokumen',
                'icon' => 'ban',
                'route' => 'sj_validation.cancel',
                'sort_order' => 126,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $editId = DB::table('permissions')->where('slug', 'sj_validation.edit')->value('id');
        $cancelId = DB::table('permissions')->where('slug', 'sj_validation.cancel')->value('id');
        if (! $editId || ! $cancelId) {
            return;
        }

        $roleIds = DB::table('role_permission')->where('permission_id', $editId)->pluck('role_id');
        foreach ($roleIds as $roleId) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $cancelId],
                ['created_at' => now(), 'updated_at' => now()]
            );
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $permissionIds = DB::table('permissions')->where('slug', 'sj_validation.cancel')->pluck('id');
        DB::table('role_permission')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->where('slug', 'sj_validation.cancel')->delete();
    }
};
