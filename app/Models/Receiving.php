<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Receiving extends Model
{
    protected $fillable = [
        'rencana_kirim_id', 'dock_id', 'gate_transaction_id',
        'status', 'total_expected_qty', 'total_received_qty',
        'dock_status', 'notes', 'checked_by',
        'actual_arrival_time', 'actual_start_time', 'actual_end_time',
    ];

    protected function casts(): array
    {
        return [
            'total_expected_qty' => 'decimal:2',
            'total_received_qty' => 'decimal:2',
            'actual_arrival_time' => 'datetime',
            'actual_start_time' => 'datetime',
            'actual_end_time' => 'datetime',
        ];
    }

    public function rencanaKirim(): BelongsTo
    {
        return $this->belongsTo(RencanaKirim::class);
    }

    public function dock(): BelongsTo
    {
        return $this->belongsTo(Dock::class);
    }

    public function gateTransaction(): BelongsTo
    {
        return $this->belongsTo(GateTransaction::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(ReceivingItem::class);
    }

    public function checker(): BelongsTo
    {
        return $this->belongsTo(User::class, 'checked_by');
    }
}
