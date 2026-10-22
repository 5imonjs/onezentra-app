<?php

namespace App\Models\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

trait HasDepotScope
{
    /**
     * Batasi query hanya pada data milik depo user (kecuali admin).
     * kode_depo adalah kunci identitas depo; nama_depo hanya label. Baris yang
     * kode_depo-nya cocok tetap boleh diakses walau nama_depo-nya kosong,
     * agar user scoped tidak kehilangan akses akibat data lama yang belum
     * lengkap.
     */
    public function scopeForUserDepot(Builder $query, User $user): Builder
    {
        if (! $user->isDepotScoped()) {
            return $query;
        }

        $codes = $user->depot_codes;

        if (empty($codes)) {
            // User scoped tapi tidak punya depot ditugaskan -> return empty result
            return $query->whereRaw('1 = 0');
        }

        return $query->whereIn('kode_depo', $codes);
    }
}
