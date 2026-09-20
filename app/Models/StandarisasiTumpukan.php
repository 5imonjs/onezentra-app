<?php

namespace App\Models;

use App\Models\Concerns\HasDepotScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StandarisasiTumpukan extends Model
{
    use HasDepotScope;

    protected $table = 'standarisasi_tumpukan';

    protected $fillable = [
        'npn_id', 'tier', 'tinggi_tumpukan', 'total_tier_tinggi', 'status',
        'requested_by', 'requested_by_email', 'approved_by', 'approved_by_email',
        'kode_depo', 'nama_depo',
    ];

    protected function casts(): array
    {
        return [
            'npn_id' => 'integer',
            'tier' => 'integer',
            'tinggi_tumpukan' => 'integer',
            'total_tier_tinggi' => 'integer',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function npn(): BelongsTo
    {
        return $this->belongsTo(Npn::class);
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
