<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BiayaRetribusiDetail extends Model
{
    protected $table = 'biaya_retribusi_details';

    protected $fillable = [
        'biaya_retribusi_id', 'biaya_thl_id', 'biaya_thl_detail_id',
        'nopol_kendaraan', 'type_kendaraan', 'no_surat_jalan',
        'nominal_biaya', 'order',
    ];

    protected function casts(): array
    {
        return [
            'biaya_retribusi_id' => 'integer',
            'biaya_thl_id' => 'integer',
            'biaya_thl_detail_id' => 'integer',
            'nominal_biaya' => 'decimal:2',
            'order' => 'integer',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function biayaRetribusi(): BelongsTo
    {
        return $this->belongsTo(BiayaRetribusi::class);
    }

    public function biayaThl(): BelongsTo
    {
        return $this->belongsTo(BiayaThl::class);
    }

    public function biayaThlDetail(): BelongsTo
    {
        return $this->belongsTo(BiayaThlDetail::class);
    }
}
