<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('standar_umur_produk', function (Blueprint $table) {
            $table->id();
            $table->string('material', 255)->nullable();
            $table->string('material_description', 255)->nullable();
            $table->string('old_material_number', 255)->nullable();
            $table->string('ext_material_group', 255)->nullable();
            $table->string('country', 255)->nullable();
            $table->string('principal', 255)->nullable();
            $table->string('cluster', 255)->nullable();
            $table->string('cluster2', 255)->nullable();
            $table->string('lob', 255)->nullable();
            $table->string('category', 255)->nullable();
            $table->string('sub_category', 255)->nullable();
            $table->string('brand', 255)->nullable();
            $table->string('incubation', 255)->nullable();
            $table->string('isi_sap', 255)->nullable();
            $table->string('isi_bosnet', 255)->nullable();
            $table->string('conversion1', 255)->nullable();
            $table->string('conversion2', 255)->nullable();
            $table->integer('min_doi')->nullable();
            $table->integer('target_doi')->nullable();
            $table->integer('max_doi')->nullable();
            $table->integer('trigger_point')->nullable();
            $table->integer('max_point')->nullable();
            $table->string('supply_pattern', 255)->nullable();
            $table->string('demand_pattern', 255)->nullable();
            $table->string('skugrp', 255)->nullable();
            $table->string('skuconv', 255)->nullable();
            $table->integer('umur')->nullable();
            $table->decimal('vol_m3', 14, 4)->nullable();
            $table->decimal('weight_kg', 14, 4)->nullable();
            $table->decimal('metric_ton', 14, 4)->nullable();
            $table->string('type_sku', 255)->nullable();
            $table->string('uom', 255)->nullable();
            $table->string('allocation_start', 255)->nullable();
            $table->string('allocation_end', 255)->nullable();
            $table->string('uom2', 255)->nullable();
            $table->string('sku_status', 255)->nullable();
            $table->string('made_in', 255)->nullable();
            $table->string('supplier', 255)->nullable();
            $table->string('product_id', 255)->nullable();
            $table->string('nickname', 255)->nullable();
            $table->string('sku_fokus_nka', 255)->nullable();
            $table->string('sku_fokus_mti', 255)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('standar_umur_produk');
    }
};
