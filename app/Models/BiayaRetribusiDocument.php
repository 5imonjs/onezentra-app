<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BiayaRetribusiDocument extends Model
{
    protected $table = 'biaya_retribusi_documents';

    protected $fillable = [
        'biaya_retribusi_id', 'document_type', 'file_path', 'file_name', 'mime_type', 'file_size', 'order',
    ];

    protected function casts(): array
    {
        return [
            'biaya_retribusi_id' => 'integer',
            'file_size' => 'integer',
            'order' => 'integer',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function biayaRetribusi(): BelongsTo
    {
        return $this->belongsTo(BiayaRetribusi::class);
    }
}
