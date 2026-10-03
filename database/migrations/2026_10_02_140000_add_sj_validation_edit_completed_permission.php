<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `sj_validation.validate` sendiri tidak pernah berubah. Gate IN_PROGRESS di
     * `scanItem`/`deleteItem` sengaja tetap ada di kode: itu bukan sekadar hak
     * akses, melainkan konsekuensi "receiving sudah termaterialisasi". Tapi ada
     * kasus nyata di lapangan: validasi sudah di-`complete()`, Receiving masih
     * PENDING/IN_PROGRESS, lalu supervisor menemukan salah input dan perlu
     * memperbaikinya.
     *
     * Permission `sj_validation.edit_completed` membuka kasus itu — hanya untuk
     * Receiving yang BELUM COMPLETED. Begitu Receiving sudah COMPLETED, dokumennya
     * tutup dan tidak ada permission apa pun yang boleh membukanya, karena angka
     * yang diedit tidak akan pernah tersinkron ke `receiving_items` (ledger yang
     * dibaca Opname Expired dan laporan Penerimaan).
     *
     * SENGAJA tidak di-grant ke role mana pun lewat `role_permission`. Berbeda
     * dari `sj_validation.cancel` yang mewarisi `edit`, permission ini harus
     * dicentang manual di Roles & Permissions — sifatnya pengecualian, bukan
     * kelanjutan akses biasa, dan default-nya harus tertutup.
     */
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'sj_validation.edit_completed'],
            [
                'name' => 'Validasi Dokumen Ubah Setelah Selesai',
                'slug' => 'sj_validation.edit_completed',
                'menu_group' => 'Validasi Dokumen',
                'icon' => 'unlock',
                'route' => 'sj_validation.edit_completed',
                'sort_order' => 128,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $permissionIds = DB::table('permissions')->where('slug', 'sj_validation.edit_completed')->pluck('id');
        DB::table('role_permission')->whereIn('permission_id', $permissionIds)->delete();
        DB::table('permissions')->where('slug', 'sj_validation.edit_completed')->delete();
    }
};
