<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class SjValidationExtraItem extends Model
{
    protected $fillable = [
        'sj_validation_id', 'npn_id', 'barcode', 'kode_barang', 'nama_barang',
        'qty', 'satuan', 'condition', 'expired_date', 'photo', 'notes',
        'recorded_by', 'status', 'approved_by', 'approved_at', 'decision_notes',
    ];

    protected function casts(): array
    {
        return [
            'qty' => 'decimal:2',
            'expired_date' => 'date',
            'approved_at' => 'datetime',
        ];
    }

    public function validation(): BelongsTo
    {
        return $this->belongsTo(SjValidation::class, 'sj_validation_id');
    }

    public function npn(): BelongsTo
    {
        return $this->belongsTo(Npn::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /**
     * Batch label yang lahir saat catatan ini disetujui — sumber identitas
     * cetak (barcode_label) dan jejak printed_at, sama seperti batch milik
     * item rencana kirim.
     */
    public function batch(): HasOne
    {
        return $this->hasOne(Batch::class, 'sj_validation_extra_item_id');
    }
}
