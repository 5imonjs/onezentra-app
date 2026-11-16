<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Jejak append-only reset baseline. Manifes baseline soft-delete agar bisa
 * diimpor ulang; audit ini tetap menyimpan snapshot + alasan + aktor.
 */
class OpnameExpiredBaselineAudit extends Model
{
    protected $fillable = [
        'baseline_import_id', 'kode_depo', 'nama_depo', 'action', 'reason',
        'actor_id', 'deleted_items', 'deleted_batches', 'deleted_waves',
        'deleted_session_items', 'manifest_snapshot',
    ];

    protected function casts(): array
    {
        return [
            'manifest_snapshot' => 'array',
            'deleted_items' => 'integer',
            'deleted_batches' => 'integer',
            'deleted_waves' => 'integer',
            'deleted_session_items' => 'integer',
        ];
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
