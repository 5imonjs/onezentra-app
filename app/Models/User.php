<?php

namespace App\Models;

use App\Models\Concerns\HasDepotScope;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['kode_depo', 'nama_depo', 'full_name', 'email', 'password', 'two_factor_secret', 'two_factor_recovery_codes', 'two_factor_confirmed_at', 'level', 'role_id', 'status'])]
#[Hidden(['password', 'two_factor_secret', 'two_factor_recovery_codes'])]
class User extends Authenticatable
{
    use HasApiTokens, HasDepotScope, HasFactory, Notifiable;

    public function isAdminMaster(): bool
    {
        return $this->level === 'admin_master';
    }

    /**
     * Apakah user dibatasi hanya dapat mengakses data depo sendiri.
     * Bypass ditentukan lewat permission `depot.view_all` (atribut role), bukan dikeras di kode.
     * User tanpa kode_depo dianggap scoped (tidak bisa akses data apapun) untuk mencegah
     * akses tidak terbatas akibat data yang belum lengkap.
     */
    public function isDepotScoped(): bool
    {
        return ! $this->hasPermission('depot.view_all');
    }

    /**
     * Cek apakah sebuah baris data (dengan kode_depo/nama_depo) boleh diakses user.
     */
    public function canAccessDepotRow(?string $rowKodeDepo, ?string $rowNamaDepo = null): bool
    {
        if (! $this->isDepotScoped()) {
            return true;
        }

        if ($rowKodeDepo !== $this->kode_depo) {
            return false;
        }

        return blank($rowNamaDepo) || $rowNamaDepo === $this->nama_depo;
    }

    /**
     * Isi kode_depo/nama_depo dari user untuk data baru.
     * Admin master boleh menentukan sendiri (dijisi default dari depo-nya bila kosong).
     */
    public function depotAttributes(array $attributes = []): array
    {
        if ($this->isDepotScoped()) {
            $attributes['kode_depo'] = $this->kode_depo;
            $attributes['nama_depo'] = $this->nama_depo;

            return $attributes;
        }

        if (! blank($this->kode_depo)) {
            $attributes['kode_depo'] ??= $this->kode_depo;
            $attributes['nama_depo'] ??= $this->nama_depo;
        }

        return $attributes;
    }

    protected function casts(): array
    {
        return [
            'two_factor_confirmed_at' => 'datetime',
            'password' => 'hashed',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function roles()
    {
        return $this->belongsToMany(Role::class, 'role_user')->withTimestamps();
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(UserActivityLog::class);
    }

    public function hasRole(string $slug): bool
    {
        return $this->roles()->where('slug', $slug)->exists();
    }

    public function hasAnyRole(array $slugs): bool
    {
        return $this->roles()->whereIn('slug', $slugs)->exists();
    }

    public function getPermissions(): Collection
    {
        $cacheKey = "user:{$this->id}:permissions";

        $cached = Cache::get($cacheKey);
        if ($cached !== null) {
            // Cache menyimpan array plain (bukan Collection Eloquent) agar aman di CACHE_STORE=database
            return collect($cached)->map(function (array $attrs): Permission {
                $model = new Permission($attrs);
                $model->exists = true;
                // Pastikan casts & original terisi agar perilaku sama dengan fresh model
                $model->setRawAttributes($attrs, true);

                return $model;
            });
        }

        $perms = Permission::join('role_permission', 'permissions.id', '=', 'role_permission.permission_id')
            ->join('role_user', 'role_permission.role_id', '=', 'role_user.role_id')
            ->join('roles', 'role_permission.role_id', '=', 'roles.id')
            ->where('role_user.user_id', $this->id)
            ->where('roles.is_active', true)
            ->where('permissions.is_active', true)
            ->select('permissions.*')
            ->distinct()
            ->get();

        // Simpan sebagai array plain untuk hindari __PHP_Incomplete_Class saat unserialize di database cache
        Cache::put($cacheKey, $perms->map->getAttributes()->toArray(), 300);

        return $perms;
    }

    public static function clearPermissionCache(int $userId): void
    {
        Cache::forget("user:{$userId}:permissions");
    }

    public function hasPermission(string $slug): bool
    {
        return $this->getPermissions()->contains('slug', $slug);
    }

    public function hasAnyPermission(array $slugs): bool
    {
        return $this->getPermissions()->pluck('slug')->intersect($slugs)->isNotEmpty();
    }

    public function getAssignedPermissionSlugs(): array
    {
        return $this->getPermissions()->pluck('slug')->toArray();
    }

    public function getRoleNames(): array
    {
        return $this->roles()->pluck('name')->toArray();
    }
}
