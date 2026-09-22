<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class BiayaThlDetail extends Model
{
    protected $table = 'biaya_thl_details';

    protected $fillable = [
        'biaya_thl_id', 'no_surat_jalan', 'nama_thl', 'driver_name', 'nopol_kendaraan',
        'type_kendaraan', 'kubikasi', 'droppoint', 'posisi',
        'jam_datang', 'jam_pulang', 'nominal_biaya', 'kendaraan_tambahan', 'kendaraan_sj',
        'kendaraan_nopol', 'kendaraan_type', 'order',
    ];

    protected function casts(): array
    {
        return [
            'biaya_thl_id' => 'integer',
            'kubikasi' => 'decimal:2',
            'nominal_biaya' => 'decimal:2',
            'kendaraan_tambahan' => 'boolean',
            'order' => 'integer',
            'jam_datang' => 'datetime',
            'jam_pulang' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function biayaThl(): BelongsTo
    {
        return $this->belongsTo(BiayaThl::class);
    }

    public function photos(): HasMany
    {
        return $this->hasMany(BiayaThlPhoto::class, 'biaya_thl_detail_id')->orderBy('order');
    }
}
