<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Batch extends Model
{
    protected $fillable = [
        'batch_number', 'receiving_id', 'sj_validation_item_id', 'barcode_label',
        'items_json', 'status',
    ];

    protected function casts(): array
    {
        return [
            'items_json' => 'array',
        ];
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
}
