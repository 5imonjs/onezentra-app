<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalAssignment extends Model
{
    protected $fillable = ['kode_depo', 'approval_level', 'user_id', 'is_active'];

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'is_active' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
