<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Manifes baseline awal hasil migrasi Excel legacy.
 *
 * Baris baseline tidak disimpan di tabel terpisah: `receiving_items` tetap
 * menjadi satu-satunya ledger (source = LEGACY_IMPORT). Manifes ini menjadi
 * bukti satu-kali-import sekaligus cutoff: Receiving dengan tanggal efektif
 * sebelum/sama dengan `imported_at` dianggap sudah tercakup baseline dan tidak
 * boleh ditambahkan lagi ke saldo operasional.
 */
class OpnameExpiredBaselineImport extends Model
{
    protected $fillable = [
        'kode_depo', 'nama_depo', 'baseline_date', 'file_name', 'file_checksum', 'row_count',
        'total_qty_crt', 'total_qty_pcs', 'imported_by', 'imported_at', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'baseline_date' => 'date',
            'imported_at' => 'datetime',
            'total_qty_crt' => 'decimal:2',
            'total_qty_pcs' => 'decimal:2',
        ];
    }

    public function importer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'imported_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(ReceivingItem::class, 'baseline_import_id');
    }
}
