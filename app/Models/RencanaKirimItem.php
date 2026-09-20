<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RencanaKirimItem extends Model
{
    protected $fillable = [
        'rencana_kirim_id', 'npn_id', 'item_number', 'kode_barang', 'nama_barang',
        'jumlah', 'satuan', 'keterangan', 'received_qty',
    ];

    protected function casts(): array
    {
        return [
            'jumlah' => 'decimal:2',
            'received_qty' => 'decimal:2',
        ];
    }

    public function rencanaKirim(): BelongsTo
    {
        return $this->belongsTo(RencanaKirim::class);
    }

    public function npn(): BelongsTo
    {
        return $this->belongsTo(Npn::class);
    }

    public function receivingItems(): HasMany
    {
        return $this->hasMany(ReceivingItem::class);
    }
}
