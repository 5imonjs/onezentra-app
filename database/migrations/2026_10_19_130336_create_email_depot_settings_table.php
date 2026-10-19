<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Saklar "email aktif/nonaktif" per depo. Sebelum ini tidak ada cara
     * mengekspresikan "matikan email untuk depo ini": depo tanpa penerima
     * selalu mewarisi baris Global, sehingga mengosongkan depo tidak pernah
     * mematikan kiriman. Baris absen = aktif (default), jadi tabel ini hanya
     * menyimpan pengecualian (depo yang benar-benar dinonaktifkan).
     */
    public function up(): void
    {
        Schema::create('email_depot_settings', function (Blueprint $table) {
            $table->id();
            $table->string('kode_depo', 20)->unique();
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_depot_settings');
    }
};
