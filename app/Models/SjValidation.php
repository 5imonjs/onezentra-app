<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SjValidation extends Model
{
    protected $fillable = [
        'rencana_kirim_id', 'validated_by', 'scan_code',
        'status', 'notes', 'started_at', 'completed_at', 'duration_seconds',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            // Integer, bukan boolean: 0 durasi (mulai dan selesai di detik yang
            // sama) adalah nilai sah dan harus tetap bisa membedakan diri dari
            // NULL yang berarti "belum dihitung".
            'duration_seconds' => 'integer',
        ];
    }

    public function rencanaKirim(): BelongsTo
    {
        return $this->belongsTo(RencanaKirim::class);
    }

    public function validator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'validated_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(SjValidationItem::class);
    }
}
