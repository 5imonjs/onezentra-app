<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Penanda bahwa baris monitoring stok kosong untuk satu kunci
 * barang|depo|expired sudah dihapus operator dan tidak boleh dibawa lagi
 * dari snapshot lama saat generate minggu berikutnya.
 */
class OpnameExpiredDismissal extends Model
{
    protected $fillable = [
        'kode_barang', 'kode_depo', 'expired_date', 'last_wave_id',
        'dismissed_week_start', 'dismissed_by', 'dismissed_at',
    ];

    protected function casts(): array
    {
        return [
            'expired_date' => 'date:Y-m-d',
            'last_wave_id' => 'integer',
            'dismissed_week_start' => 'date:Y-m-d',
            'dismissed_at' => 'datetime',
        ];
    }

    public function dismisser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dismissed_by');
    }
}
