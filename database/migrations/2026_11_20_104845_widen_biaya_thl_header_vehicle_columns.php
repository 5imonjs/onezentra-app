<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Header THL adalah ringkasan SELURUH detail (nopol/type/SJ digabung dengan
     * ", " dan dibatasi Str::limit(..., 255) di BiayaThlController), tetapi
     * kolomnya masih varchar(20)/varchar(50). Pengajuan dengan beberapa
     * kendaraan membuat INSERT gagal: SQLSTATE 22001 Data too long.
     */
    public function up(): void
    {
        Schema::table('biaya_thls', function (Blueprint $table): void {
            $table->string('no_kendaraan', 255)->nullable()->change();
            $table->string('type_kendaraan', 255)->nullable()->change();
            $table->string('no_surat_jalan', 255)->nullable()->change();
        });
    }

    public function down(): void
    {
        // Potong dulu agar perubahan tipe tidak gagal pada baris lama yang
        // sudah berisi ringkasan panjang.
        DB::table('biaya_thls')->update([
            'no_kendaraan' => DB::raw('LEFT(no_kendaraan, 20)'),
            'type_kendaraan' => DB::raw('LEFT(type_kendaraan, 50)'),
            'no_surat_jalan' => DB::raw('LEFT(no_surat_jalan, 50)'),
        ]);

        Schema::table('biaya_thls', function (Blueprint $table): void {
            $table->string('no_kendaraan', 20)->nullable()->change();
            $table->string('type_kendaraan', 50)->nullable()->change();
            $table->string('no_surat_jalan', 50)->nullable()->change();
        });
    }
};
