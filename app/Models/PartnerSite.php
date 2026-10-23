<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PartnerSite extends Model
{
    protected $primaryKey = 'kode_ps';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'kode_ps',
        'kode_depo',
        'nama_ps',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function depot(): BelongsTo
    {
        return $this->belongsTo(DepotSetting::class, 'kode_depo', 'kode_depo');
    }
}
