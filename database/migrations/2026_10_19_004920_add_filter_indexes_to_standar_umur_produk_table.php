<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Halaman daftar/export `standar_umur_produk` memfilter baris dengan pencocokan
 * persis (`WHERE brand = ?`, `WHERE category = ?`). Tanpa indeks, tiap filter
 * melakukan full-table scan pada tabel katalog yang bisa puluhan ribu baris.
 *
 * Indeks lookup `material`/`product_id` sudah ditambahkan di migrasi
 * 2026_10_18_150146; ini melengkapinya untuk kolom filter.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('standar_umur_produk', function (Blueprint $table): void {
            $table->index('brand', 'standar_umur_produk_brand_index');
            $table->index('category', 'standar_umur_produk_category_index');
        });
    }

    public function down(): void
    {
        Schema::table('standar_umur_produk', function (Blueprint $table): void {
            $table->dropIndex('standar_umur_produk_brand_index');
            $table->dropIndex('standar_umur_produk_category_index');
        });
    }
};
