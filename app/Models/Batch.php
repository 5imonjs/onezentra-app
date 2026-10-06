<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Batch extends Model
{
    protected $fillable = [
        'batch_number', 'receiving_id', 'sj_validation_item_id', 'receiving_item_id', 'barcode_label',
        'items_json', 'status',
    ];

    protected function casts(): array
    {
        return [
            'items_json' => 'array',
        ];
    }

    /**
     * Terbitkan satu Batch untuk satu baris ledger (aturan: tiap baris
     * ledger wajib tepat satu batch). Idempoten — baris yang sudah berlabel
     * (SJ maupun sesi/import) dikembalikan apa adanya.
     */
    public static function issueForReceivingItem(ReceivingItem $item, array $extra = []): Batch
    {
        $existing = $item->batch ?? $item->verifiedBatch;

        if ($existing) {
            return $existing;
        }

        return static::create(array_merge([
            'batch_number' => static::generateNumber('IMP-'),
            'barcode_label' => static::generateLabel(),
            'receiving_item_id' => $item->id,
            'items_json' => [
                'kode_barang' => $item->kode_barang,
                'nama_barang' => $item->nama_barang,
                'qty_crt' => $item->actual_qty,
                'qty_pcs' => $item->qty_pcs,
                'expired_date' => $item->expired_date?->toDateString(),
                'source' => $item->source,
                'origin' => 'import',
            ],
            'status' => 'ACTIVE',
        ], $extra));
    }

    /**
     * Generate nomor unik dengan prefix, coba ulang bila collision.
     */
    public static function generateNumber(string $prefix, int $length = 8): string
    {
        do {
            $number = $prefix.strtoupper(Str::random($length));
        } while (static::where('batch_number', $number)->exists());

        return $number;
    }

    public static function generateLabel(int $length = 10): string
    {
        do {
            $label = 'LBL-'.strtoupper(Str::random($length));
        } while (static::where('barcode_label', $label)->exists());

        return $label;
    }

    public function receiving(): BelongsTo
    {
        return $this->belongsTo(Receiving::class);
    }

    public function validationItem(): BelongsTo
    {
        return $this->belongsTo(SjValidationItem::class, 'sj_validation_item_id');
    }

    /**
     * Baris ledger hasil verifikasi sesi lapangan (aturan A2). Batch SJ
     * memakai sj_validation_item_id; batch sesi memakai kolom ini.
     */
    public function receivingItem(): BelongsTo
    {
        return $this->belongsTo(ReceivingItem::class, 'receiving_item_id');
    }
}
