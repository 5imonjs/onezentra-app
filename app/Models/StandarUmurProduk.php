<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StandarUmurProduk extends Model
{
    use HasFactory;

    protected $table = 'standar_umur_produk';

    protected $fillable = [
        'material', 'material_description', 'old_material_number',
        'ext_material_group', 'country', 'principal', 'cluster', 'cluster2',
        'lob', 'category', 'sub_category', 'brand', 'incubation',
        'isi_sap', 'isi_bosnet', 'conversion1', 'conversion2',
        'min_doi', 'target_doi', 'max_doi', 'trigger_point', 'max_point',
        'supply_pattern', 'demand_pattern', 'skugrp', 'skuconv',
        'umur', 'vol_m3', 'weight_kg', 'metric_ton',
        'type_sku', 'uom', 'allocation_start', 'allocation_end',
        'uom2', 'sku_status', 'made_in', 'product_id',
        'nickname', 'sku_fokus_nka', 'sku_fokus_mti',
    ];

    protected function casts(): array
    {
        return [
            'min_doi' => 'integer',
            'target_doi' => 'integer',
            'max_doi' => 'integer',
            'trigger_point' => 'integer',
            'max_point' => 'integer',
            'umur' => 'integer',
            'vol_m3' => 'decimal:4',
            'weight_kg' => 'decimal:4',
            'metric_ton' => 'decimal:4',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }
}
