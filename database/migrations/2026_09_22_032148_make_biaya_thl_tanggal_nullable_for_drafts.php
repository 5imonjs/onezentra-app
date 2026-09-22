<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Draft boleh disimpan tanpa tanggal (kelengkapan diverifikasi saat
     * submit). Kolom tetap wajib secara validasi untuk pengajuan final.
     */
    public function up(): void
    {
        Schema::table('biaya_thls', function (Blueprint $table) {
            $table->date('tanggal_pengajuan')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('biaya_thls', function (Blueprint $table) {
            $table->date('tanggal_pengajuan')->nullable(false)->change();
        });
    }
};
