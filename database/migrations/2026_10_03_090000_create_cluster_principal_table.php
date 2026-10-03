<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Master Cluster / Principal — pemetaan SKU produk ke principalnya.
     *
     * SENGAJA GLOBAL, tanpa `kode_depo`. Berbeda dengan modul operasional
     * (Receiving, Validasi SJ) yang datanya milik satu depo, pemetaan
     * SKU -> Principal adalah referensi produk yang sama berlaku di seluruh
     * jaringan. Menyalinnya per depo hanya menghasilkan N salinan yang harus
     * disinkronkan manual, dan cepat berbeda antar depo.
     *
     * Kolom `lob`..`principal_2` mengikuti urutan file sumber dari user, bukan
     * urutan alfabetis, supaya hasil export bisa langsung dibandingkan dengan
     * file aslinya.
     */
    public function up(): void
    {
        Schema::create('cluster_principal', function (Blueprint $table) {
            $table->id();
            $table->string('lob')->nullable();
            $table->string('product_category')->nullable();
            $table->string('sub_product_category')->nullable();
            $table->string('product_group')->nullable();
            $table->string('product_class')->nullable();
            $table->string('product_sku')->nullable();
            $table->string('principal_1')->nullable();
            $table->string('principal_2')->nullable();
            $table->foreignId('created_by')->nullable();
            $table->timestamps();

            // Product SKU adalah kunci alami tabel ini: satu SKU pointing ke satu
            // principal. Import mengulang baris yang sama kalau SKU-nya cocok, dan
            // tanpa constraint ini file yang di-import dua kali akan menduplikasi
            // referensi alih-alih memperbaruinya.
            $table->unique('product_sku');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cluster_principal');
    }
};
