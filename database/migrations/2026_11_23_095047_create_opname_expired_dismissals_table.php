<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Penanda "stok sudah nol" per kunci barang|depo|expired.
     *
     * Dibuat saat operator menghapus baris monitoring yang qty efektifnya 0.
     * Tanpa penanda ini, generate minggu berikutnya akan jatuh kembali ke
     * snapshot lama (sebelum koreksi) dan memunculkan qty lama — stok yang
     * sudah dikoreksi habis bisa "hidup lagi" di opname berikutnya.
     *
     * `last_wave_id` menyimpan batas snapshot yang boleh dinolkan: hanya wave
     * dengan id <= batas itu. Wave baru (mis. penerimaan susulan) tetap
     * membawa qty-nya sendiri.
     */
    public function up(): void
    {
        Schema::create('opname_expired_dismissals', function (Blueprint $table): void {
            $table->id();
            $table->string('kode_barang', 50);
            $table->string('kode_depo', 20);
            $table->date('expired_date');
            $table->unsignedBigInteger('last_wave_id');
            $table->date('dismissed_week_start');
            $table->foreignId('dismissed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('dismissed_at');
            $table->timestamps();

            $table->unique(
                ['kode_barang', 'kode_depo', 'expired_date'],
                'opname_dismissal_key_unique'
            );
            $table->index('last_wave_id', 'idx_oed_last_wave');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('opname_expired_dismissals');
    }
};
