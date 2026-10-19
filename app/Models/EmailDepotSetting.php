<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Saklar email per depo. Absennya baris = kirim (aktif); baris dengan
 * `is_enabled = false` mematikan SEMUA notifikasi untuk depo tersebut walau
 * baris Global terkonfigurasi.
 */
class EmailDepotSetting extends Model
{
    protected $fillable = [
        'kode_depo',
        'is_enabled',
    ];

    protected function casts(): array
    {
        return [
            'is_enabled' => 'boolean',
        ];
    }
}
