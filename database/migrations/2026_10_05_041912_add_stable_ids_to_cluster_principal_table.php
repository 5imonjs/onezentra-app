<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Kunci stabil untuk join principal.
     *
     * `product_sku` adalah nickname yang bisa berubah (JDO1A vs JDO1/JDO1,
     * OJDJE8/JDO1A) — join laporan yang bergantung padanya meleset walau
     * produknya sama. `BOSnetszProductId` (14 digit, tersimpan sebagai
     * receiving_items.kode_barang) tidak berubah, jadi disimpan di sini
     * sebagai kunci join utama. `SAPszProductId` ikut disimpan sebagai
     * kunci cadangan jalur standar_umur_produk.material.
     *
     * Kolom nullable + non-unique: backfill berjalan terpisah lewat
     * `cluster-principal:backfill-stable-ids`, dan beberapa baris CP memang
     * tidak punya padanan NPN (tetap NULL, laporan jatuh ke fallback SUP).
     */
    public function up(): void
    {
        Schema::table('cluster_principal', function (Blueprint $table) {
            $table->string('bosnetsz_product_id')->nullable()->after('product_sku');
            $table->string('sap_product_id')->nullable()->after('bosnetsz_product_id');
            $table->index('bosnetsz_product_id');
            $table->index('sap_product_id');
        });
    }

    public function down(): void
    {
        Schema::table('cluster_principal', function (Blueprint $table) {
            $table->dropIndex(['bosnetsz_product_id']);
            $table->dropIndex(['sap_product_id']);
            $table->dropColumn(['bosnetsz_product_id', 'sap_product_id']);
        });
    }
};
