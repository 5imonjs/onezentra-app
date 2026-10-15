<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DepotSetting extends Model
{
    protected $fillable = [
        'kode_depo',
        'nama_depo',
        'nama_pengirim',
        'alamat_pengirim',
        'telepon_pengirim',
        'email_pengirim',
        'nama_tujuan',
        'alamat_tujuan',
        'telepon_tujuan',
        'email_tujuan',
        'npwp',
        'logo_path',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }
}
