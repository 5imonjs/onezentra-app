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

        return $query->where('kode_depo', $user->kode_depo)
            ->when(! blank($user->nama_depo), function (Builder $q) use ($user): Builder {
                return $q->where(function (Builder $inner) use ($user): void {
                    $inner->where('nama_depo', $user->nama_depo)
                        ->orWhereNull('nama_depo')
                        ->orWhere('nama_depo', '');
                });
            });
    }
}
