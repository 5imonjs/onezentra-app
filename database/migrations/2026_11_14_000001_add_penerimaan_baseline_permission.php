<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Pemasangan saldo awal (baseline) sebelumnya menumpang `penerimaan.create`.
     * Akibatnya hanya role yang boleh menambah penerimaan penuh yang dapat
     * memasang saldo awal; admin depo yang seharusnya cukup memasang saldo
     * pembuka tidak bisa melakukannya tanpa ikut mendapat akses input
     * penerimaan.
     *
     * Permission dipisah supaya bisa di-on/off-kan per role lewat
     * Roles & Permissions — sama seperti permission lain. Migrasi ini hanya
     * menyiapkan permission-nya; TIDAK ada grant otomatis ke role tertentu,
     * sehingga pemegangnya ditentukan dari setting role & permission.
     */
    public function up(): void
    {
        DB::table('permissions')->updateOrInsert(
            ['slug' => 'penerimaan.baseline'],
            [
                'name' => 'Penerimaan Pasang Saldo Awal',
                'slug' => 'penerimaan.baseline',
                'menu_group' => 'Penerimaan',
                'icon' => 'upload',
                'route' => 'receiving_items.import_baseline',
                'description' => 'Memasang saldo awal (baseline) sekali per depo. Terpisah dari izin tambah penerimaan agar bisa diberikan ke admin depo tanpa memberi akses input penerimaan penuh.',
                'sort_order' => 185,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    /**
     * Rollback tidak menghapus permission agar grant manual yang sudah diatur
     * admin lewat Roles & Permissions tidak hilang.
     */
    public function down(): void
    {
        // no-op
    }
};
