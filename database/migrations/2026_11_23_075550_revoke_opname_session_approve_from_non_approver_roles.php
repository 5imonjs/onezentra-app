<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Praktik opname: MENGHITUNG fisik = petugas yang ditugaskan (mobile),
     * MENYETUJUI/koreksi = penugas (BLC / admin_master) di web.
     *
     * Migrasi 2026_11_05 memberikan `opname.session.approve` ke SEMUA role
     * pemegang `opname.edit` — termasuk cheker/staff_logistic/rlh yang hanya
     * berhak menghitung. Cabut grant approve dari role non-penugas supaya
     * middleware `permission:opname.session.approve` menolak mereka (dan tombol
     * Validasi tidak muncul di UI), bukan mengandalkan guard runtime saja.
     */
    public function up(): void
    {
        $approveId = DB::table('permissions')->where('slug', 'opname.session.approve')->value('id');
        if (! $approveId) {
            return;
        }

        $approverRoleIds = DB::table('roles')
            ->whereIn('slug', ['admin_master', 'blc'])
            ->pluck('id');

        DB::table('role_permission')
            ->where('permission_id', $approveId)
            ->whereNotIn('role_id', $approverRoleIds)
            ->delete();
    }

    /**
     * Forward-only: rollback tidak mengembalikan grant ke role penghitung —
     * keputusan akses ini sengaja permanen (sama seperti migrasi grant awal).
     */
    public function down(): void
    {
        // no-op
    }
};
