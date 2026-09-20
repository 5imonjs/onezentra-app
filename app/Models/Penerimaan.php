<?php

namespace App\Models;

use App\Models\Concerns\HasDepotScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Penerimaan extends Model
{
    use HasDepotScope;

    protected $table = 'penerimaan';

    public $timestamps = false;

    protected $fillable = [
        'tanggal_penerimaan', 'no_shipment', 'No_Container',
        'szBarcode', 'szBarcodeSekunder', 'szBarcodeTersier',
        'BOSnetszProductId', 'SAPszProductId', 'szNickName',
        'szCompUomDesc', 'BOSnetdecUom', 'SAPszUomId', 'SAPdecUom',
        'kode_depo', 'nama_depo', 'saved_by',
        'DO_QTY', 'expired_date', 'sisa', 'szStatus',
        'created_at', 'status', 'completed_at', 'request_id',
    ];

    protected function casts(): array
    {
        return [
            'tanggal_penerimaan' => 'date',
            'expired_date' => 'date',
            'DO_QTY' => 'decimal:2',
            'created_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function savedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'saved_by');
    }
}
