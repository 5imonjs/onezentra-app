<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('depot_settings', function (Blueprint $table) {
            $table->id();
            $table->string('kode_depo', 20)->unique();
            $table->string('nama_depo', 100);

            // Origin fields (Pengirim)
            $table->string('nama_pengirim', 200)->nullable();
            $table->text('alamat_pengirim')->nullable();
            $table->string('telepon_pengirim', 50)->nullable();
            $table->string('email_pengirim', 255)->nullable();

            // Destination fields (Tujuan)
            $table->string('nama_tujuan', 200)->nullable();
            $table->text('alamat_tujuan')->nullable();
            $table->string('telepon_tujuan', 50)->nullable();
            $table->string('email_tujuan', 255)->nullable();

            $table->string('npwp', 50)->nullable();
            $table->string('logo_path', 255)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('depot_settings');
    }
};
