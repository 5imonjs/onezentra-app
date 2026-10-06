<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OpnameExpiredSessionItem extends Model
{
    protected $fillable = [
        'session_id', 'wave_id', 'batch_id', 'qty_fisik_crt', 'qty_fisik_pcs',
        'condition', 'photo', 'notes', 'verified_at', 'verified_by',
    ];

    protected function casts(): array
    {
        return [
            'qty_fisik_crt' => 'decimal:2',
            'qty_fisik_pcs' => 'decimal:2',
            'verified_at' => 'datetime',
        ];
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(OpnameExpiredSession::class, 'session_id');
    }

    public function wave(): BelongsTo
    {
        return $this->belongsTo(OpnameExpiredWave::class, 'wave_id');
    }

    /**
     * Batch yang diverifikasi baris ini. Null hanya untuk baris warisan —
     * labelnya diterbitkan susulan saat verifikasi pertama.
     */
    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class, 'batch_id');
    }

    public function verifier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    public function isVerified(): bool
    {
        return $this->verified_at !== null;
    }
}
