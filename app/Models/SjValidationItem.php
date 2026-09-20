<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class SjValidationItem extends Model
{
    protected $fillable = [
        'sj_validation_id', 'rencana_kirim_item_id', 'npn_id', 'barcode',
        'kode_barang', 'nama_barang', 'expected_qty', 'actual_qty',
        'expired_date', 'satuan', 'condition', 'notes', 'status', 'photo',
    ];

    protected function casts(): array
    {
        return [
            'expected_qty' => 'decimal:2',
            'actual_qty' => 'decimal:2',
            'expired_date' => 'date',
        ];
    }

    public function validation(): BelongsTo
    {
        return $this->belongsTo(SjValidation::class, 'sj_validation_id');
    }

    public function rencanaKirimItem(): BelongsTo
    {
        return $this->belongsTo(RencanaKirimItem::class);
    }

    public function npn(): BelongsTo
    {
        return $this->belongsTo(Npn::class);
    }

    public function batch(): HasOne
    {
        return $this->hasOne(Batch::class);
    }
}
