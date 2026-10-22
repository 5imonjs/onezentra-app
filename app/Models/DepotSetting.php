<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DepotSetting extends Model
{
    protected $primaryKey = 'kode_depo';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'kode_depo',
        'nama_depo',
        'region_id',
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

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_depots', 'kode_depo', 'user_id')
            ->withTimestamps()
            ->withPivot('assigned_at');
    }
}
