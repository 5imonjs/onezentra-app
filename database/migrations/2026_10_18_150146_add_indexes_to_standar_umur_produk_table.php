<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `standar_umur_produk` dibaca lewat `material` (join dari npn.SAPszProductId)
 * dan `product_id` (fallback pencocokan saat import). Tanpa indeks, tiap lookup
 * melakukan full-table scan yang memburuk seiring bertambahnya produk.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('standar_umur_produk', function (Blueprint $table): void {
            $table->index('material', 'standar_umur_produk_material_index');
            $table->index('product_id', 'standar_umur_produk_product_id_index');
        });
    }

    public function down(): void
    {
        Schema::table('standar_umur_produk', function (Blueprint $table): void {
            $table->dropIndex('standar_umur_produk_material_index');
            $table->dropIndex('standar_umur_produk_product_id_index');
        });
    }
};
