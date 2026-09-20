<?php

namespace App\Models\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

trait HasDepotScope
{
    /**
     * Batasi query hanya pada data milik depo user (kecuali admin).
     */
    public function scopeForUserDepot(Builder $query, User $user): Builder
    {
        if (! $user->isDepotScoped()) {
            return $query;
        }

        return $query->where('kode_depo', $user->kode_depo)
            ->where('nama_depo', $user->nama_depo);
    }
}
