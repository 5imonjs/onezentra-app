<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Satu baris koreksi stok yang lahir dari sesi opname yang disetujui.
 *
 * Append-only: nilai qty adalah delta fisik - qty sistem saat sesi dimulai.
 * Qty acuan sesi berikutnya = qty ledger asli + total delta batch ini.
 */
class OpnameExpiredAdjustment extends Model
{
    protected $fillable = [
        'session_id', 'wave_id', 'batch_id', 'receiving_item_id', 'item_key',
        'qty_crt', 'qty_pcs', 'expected_crt', 'expected_pcs',
        'physical_crt', 'physical_pcs', 'disposition', 'notes',
        'approved_by', 'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'qty_crt' => 'decimal:2',
            'qty_pcs' => 'decimal:2',
            'expected_crt' => 'decimal:2',
            'expected_pcs' => 'decimal:2',
            'physical_crt' => 'decimal:2',
            'physical_pcs' => 'decimal:2',
            'approved_at' => 'datetime',
        ];
    }

    public static function itemKeyFor(?Batch $batch): string
    {
        return $batch ? 'batch:'.$batch->id : 'legacy';
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(OpnameExpiredSession::class, 'session_id');
    }

    public function wave(): BelongsTo
    {
        return $this->belongsTo(OpnameExpiredWave::class, 'wave_id');
    }

    public function batch(): BelongsTo
    {
        return $this->belongsTo(Batch::class);
    }

    public function receivingItem(): BelongsTo
    {
        return $this->belongsTo(ReceivingItem::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
