<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OpnameExpiredWave extends Model
{
    protected $fillable = [
        'week_start', 'week_end', 'kode_depo', 'nama_depo', 'kode_barang', 'nama_barang',
        'sumber_material', 'tanggal_penerimaan', 'expired_date_ini', 'expired_date_lalu', 'selisih_expired_date',
        'sisa_hari', 'status_ini', 'status_lalu', 'perubahan', 'rekomendasi',
        'qty_ini_crt', 'qty_ini_pcs', 'qty_lalu_crt', 'qty_lalu_pcs',
        'qty_koreksi_crt', 'qty_koreksi_pcs', 'koreksi_by', 'koreksi_at',
        'validated_by', 'validated_at', 'batch_numbers',
    ];

    protected function casts(): array
    {
        return [
            'expired_date_ini' => 'date:Y-m-d',
            'expired_date_lalu' => 'date:Y-m-d',
            'tanggal_penerimaan' => 'date:Y-m-d',
            'qty_ini_crt' => 'decimal:2',
            'qty_ini_pcs' => 'decimal:2',
            'qty_lalu_crt' => 'decimal:2',
            'qty_lalu_pcs' => 'decimal:2',
            'qty_koreksi_crt' => 'decimal:2',
            'qty_koreksi_pcs' => 'decimal:2',
            'koreksi_at' => 'datetime',
            'validated_at' => 'datetime',
            'batch_numbers' => 'array',
        ];
    }

    public function effectiveCrt(): float
    {
        return (float) $this->qty_ini_crt + (float) $this->qty_koreksi_crt;
    }

    public function effectivePcs(): float
    {
        return (float) $this->qty_ini_pcs + (float) $this->qty_koreksi_pcs;
    }

    public function validator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'validated_by');
    }
}
