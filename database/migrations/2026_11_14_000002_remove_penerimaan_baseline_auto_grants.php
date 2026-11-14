<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Versi awal migrasi `penerimaan.baseline` sempat memberi grant otomatis
     * ke role pemegang `penerimaan.create`. Keputusan akses diubah: permission
     * ini tidak punya pemegang khusus — pemegangnya cukup diatur dari
     * Roles & Permissions seperti permission lain.
     *
     * Migrasi ini membersihkan grant otomatis tersebut pada environment yang
     * sudah menjalankan versi awal. Grant manual setelah migrasi ini berjalan
     * tetap dipertahankan (down no-op).
     */
    public function up(): void
    {
        $permissionId = DB::table('permissions')->where('slug', 'penerimaan.baseline')->value('id');
        if (! $permissionId) {
            return;
        }

        DB::table('role_permission')->where('permission_id', $permissionId)->delete();
    }

    /**
     * Forward-only: rollback tidak mengembalikan grant otomatis.
     */
    public function down(): void
    {
        // no-op
    }
};
