<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BiayaThlVehicle extends Model
{
    protected $table = 'biaya_thl_vehicles';

    protected $fillable = [
        'biaya_thl_detail_id',
        'no_sj',
        'nopol',
        'type',
        'order',
    ];

    protected function casts(): array
    {
        return [
            'biaya_thl_detail_id' => 'integer',
            'order' => 'integer',
        ];
    }

    public function detail(): BelongsTo
    {
        return $this->belongsTo(BiayaThlDetail::class, 'biaya_thl_detail_id');
    }
}
