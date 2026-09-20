<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BiayaThlPhoto extends Model
{
    protected $table = 'biaya_thl_photos';

    protected $fillable = [
        'biaya_thl_id', 'biaya_thl_detail_id', 'file_path', 'file_name', 'mime_type', 'file_size', 'order',
    ];

    protected function casts(): array
    {
        return [
            'biaya_thl_id' => 'integer',
            'biaya_thl_detail_id' => 'integer',
            'file_size' => 'integer',
            'order' => 'integer',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function biayaThl(): BelongsTo
    {
        return $this->belongsTo(BiayaThl::class);
    }

    public function detail(): BelongsTo
    {
        return $this->belongsTo(BiayaThlDetail::class, 'biaya_thl_detail_id');
    }
}
