<?php

namespace App\Models;

use App\Models\Concerns\HasDepotScope;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\HasApiTokens;

// 'role_id' SENGAJA TIDAK ada di daftar ini.
//
// Kolomnya masih ada di tabel (legacy) dan masih ditulis server lewat
// forceFill(), tapi tidak pernah dipakai untuk resolusi permission — itu lewat
// pivot `role_user`. Membiarkannya fillable hanya membuka satu jalan: begitu
// rules() suatu saat memuat field ini, user bisa elevating role-nya sendiri.
//
// Penulisan ke kolom ini harus selalu eksplisit di sisi server, lihat
// SecurityAuditTest::test_role_id_bisa_ditulis_server_walau_tidak_fillable.
#[Fillable(['kode_depo', 'nama_depo', 'region_id', 'full_name', 'alamat', 'email', 'password', 'two_factor_secret', 'two_factor_recovery_codes', 'two_factor_confirmed_at', 'level', 'status'])]
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
        // Setiap user tanpa `depot.view_all` tetap dibatasi (scoped), baik ke
        // depot yang di-assign maupun ke seluruh depot di region-nya. Hanya
        // `depot.view_all` yang membuka akses global.
        return ! $this->hasPermission('depot.view_all');
    }

    /**
     * Apakah user mengikuti cakupan region (semua depot di region-nya).
     * Hanya berlaku bila permission `depot.view_region` dipegang DAN region_id terisi.
     */
    public function hasRegionScope(): bool
    {
        return $this->hasPermission('depot.view_region') && ! blank($this->region_id);
    }

    /**
     * Apakah user dibatasi hanya pada region-nya (region-scoped).
     */
    public function isRegionScoped(): bool
    {
        return $this->hasPermission('depot.view_region');
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

    /**
     * Depot yang dapat diakses user (pivot table user_depots).
     * Untuk user depot-scoped: daftar depot yang dikelola.
     * Untuk user global (depot.view_all): kosong (akses semua lewat permission).
     */
    public function depots(): BelongsToMany
    {
        return $this->belongsToMany(
            DepotSetting::class,
            'user_depots',
            'user_id',       // FK di pivot ke users.id
            'kode_depo',     // FK di pivot ke depot_settings.kode_depo
            'id',            // PK di users
            'kode_depo'      // PK di depot_settings
        )
            ->withTimestamps()
            ->withPivot('assigned_at');
    }

    /**
     * Kode depot yang dapat diakses user (untuk scoping query).
     * - Global (depot.view_all): return [] (no filter)
     * - Region-scoped (depot.view_region): return all depots in user's region
     * - Depot-scoped: return assigned depots from user_depots pivot
     */
    public function getDepotCodesAttribute(): array
    {
        // User global (punya depot.view_all) tidak dibatasi depot_codes
        if ($this->hasPermission('depot.view_all')) {
            return [];
        }

        // User region-scoped (depot.view_region + region_id): semua depot aktif
        // di region tersebut.
        if ($this->hasRegionScope()) {
            return \DB::table('depot_settings')
                ->where('region_id', $this->region_id)
                ->where('is_active', true)
                ->pluck('kode_depo')
                ->toArray();
        }

        // Depot-scoped: Direct query to avoid ambiguous column issue with BelongsToMany
        $codes = \DB::table('user_depots')
            ->where('user_id', $this->id)
            ->pluck('kode_depo')
            ->toArray();

        // Fallback ke kolom legacy untuk backward compatibility
        // (user lama yang belum dimigrasi ke user_depots)
        if (empty($codes) && ! blank($this->kode_depo)) {
            $codes = [$this->kode_depo];
        }

        return array_values(array_unique($codes));
    }

    /**
     * Cek apakah sebuah baris data (dengan kode_depo/nama_depo) boleh diakses user.
     * Mendukung multi-depot via user_depots pivot.
     */
    public function canAccessDepotRow(?string $rowKodeDepo, ?string $rowNamaDepo = null): bool
    {
        if (! $this->isDepotScoped()) {
            return true;
        }

        if (! $rowKodeDepo) {
            return false;
        }

        $allowedCodes = $this->depot_codes;

        if (empty($allowedCodes)) {
            // User scoped tapi tidak punya depot ditugaskan -> tidak bisa akses apa pun
            return false;
        }

        if (! in_array($rowKodeDepo, $allowedCodes, true)) {
            return false;
        }

        // nama_depo opsional: jika dikirim, cocokkan; jika tidak, lewatkan
        if (! blank($rowNamaDepo)) {
            // Cek nama_depo dari depot_settings untuk validasi ketat
            $depot = DepotSetting::where('kode_depo', $rowKodeDepo)->first();
            if ($depot && $depot->nama_depo !== $rowNamaDepo) {
                return false;
            }
        }

        return true;
    }

    /**
     * Isi kode_depo/nama_depo dari user untuk data baru.
     * - Depot-scoped: gunakan depot pertama dari user_depots (atau legacy kode_depo)
     * - Global: biarkan seperti sebelumnya (default dari user jika ada)
     */
    public function depotAttributes(array $attributes = []): array
    {
        if ($this->isDepotScoped()) {
            $codes = $this->depot_codes;
            $requested = $attributes['kode_depo'] ?? null;

            // Multi-depot / region: hormati depo yang diminta selama masih
            // berada dalam cakupan user. Jika tidak, jatuh ke depot utama.
            if (! empty($codes) && ! blank($requested) && in_array($requested, $codes, true)) {
                $requestedDepot = DepotSetting::where('kode_depo', $requested)->first();
                $attributes['nama_depo'] = $requestedDepot?->nama_depo
                    ?? $attributes['nama_depo']
                    ?? $requested;

                return $attributes;
            }

            if (! empty($codes)) {
                $primaryDepot = DepotSetting::where('kode_depo', $codes[0])->first();
                $attributes['kode_depo'] = $codes[0];
                // Fallback ke nama_depo dari user jika DepotSetting tidak ditemukan
                $attributes['nama_depo'] = $primaryDepot?->nama_depo ?? $this->nama_depo ?? $codes[0];
            } elseif (! blank($this->kode_depo)) {
                // Fallback legacy: lookup nama_depo dari DepotSetting
                $legacyDepot = DepotSetting::where('kode_depo', $this->kode_depo)->first();
                $attributes['kode_depo'] = $this->kode_depo;
                $attributes['nama_depo'] = $legacyDepot?->nama_depo ?? $this->nama_depo ?? $this->kode_depo;
            }

            return $attributes;
        }

        if (! blank($this->kode_depo)) {
            $attributes['kode_depo'] ??= $this->kode_depo;
            $attributes['nama_depo'] ??= $this->nama_depo;
        }

        return $attributes;
    }

    /**
     * Terapkan filter depot pada query. Untuk user scoped, hanya baris dengan
     * kode_depo di `depot_codes` yang lolos; user tanpa depot sama sekali
     * menghasilkan query kosong (bukan tanpa filter).
     */
    public function applyDepotFilter(Builder $query, string $column = 'kode_depo'): Builder
    {
        if (! $this->isDepotScoped()) {
            return $query;
        }

        $codes = $this->depot_codes;

        if (empty($codes)) {
            return $query->whereRaw('1 = 0');
        }

        return $query->whereIn($column, $codes);
    }

    /**
     * Aktor terakhir yang mengubah akun ini (jejak anti-eskalasi diam-diam).
     */
    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
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

        // Level master melewati RBAC role: selalu memegang seluruh permission
        // aktif. Satu titik ini mengendalikan middleware permission, respons
        // login (slug ke frontend), dan semua hasPermission di backend.
        if ($this->level === 'admin_master') {
            $perms = Permission::where('is_active', true)->get();
        } else {
            $perms = Permission::join('role_permission', 'permissions.id', '=', 'role_permission.permission_id')
                ->join('role_user', 'role_permission.role_id', '=', 'role_user.role_id')
                ->join('roles', 'role_permission.role_id', '=', 'roles.id')
                ->where('role_user.user_id', $this->id)
                ->where('roles.is_active', true)
                ->where('permissions.is_active', true)
                ->select('permissions.*')
                ->distinct()
                ->get();
        }

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
