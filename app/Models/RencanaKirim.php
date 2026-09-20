<?php

namespace App\Models;

use App\Models\Concerns\HasDepotScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class RencanaKirim extends Model
{
    use HasDepotScope;

    protected $table = 'rencana_kirim';

    protected $fillable = [
        'rkh_date', 'po_transporter',
        'driver_name', 'nopol', 'jenis_kendaraan', 'expedisi',
        'shipper_name', 'shipper_address', 'shipper_phone',
        'destination_name', 'destination_address',
        'kode_depo', 'nama_depo', 'total_qty',
        'status', 'notes', 'created_by',
        'scheduled_at', 'checked_in_at', 'verified_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'rkh_date' => 'date',
            'total_qty' => 'decimal:2',
            'scheduled_at' => 'datetime',
            'checked_in_at' => 'datetime',
            'verified_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(RencanaKirimItem::class);
    }

    public function gateTransactions(): HasMany
    {
        return $this->hasMany(GateTransaction::class);
    }

    public function receivings(): HasMany
    {
        return $this->hasMany(Receiving::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function sjValidations(): HasMany
    {
        return $this->hasMany(SjValidation::class);
    }
}
