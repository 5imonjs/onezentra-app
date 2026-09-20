<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GateTransaction extends Model
{
    protected $fillable = [
        'rencana_kirim_id', 'gate_type', 'nopol', 'driver_name',
        'po_transporter', 'container_number', 'status', 'notes',
        'scanned_by', 'scan_time',
    ];

    protected function casts(): array
    {
        return [
            'scan_time' => 'datetime',
        ];
    }

    public function rencanaKirim(): BelongsTo
    {
        return $this->belongsTo(RencanaKirim::class);
    }

    public function scanner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'scanned_by');
    }
}
