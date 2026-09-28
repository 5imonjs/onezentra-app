<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Role extends Model
{
    public const LEVEL_SLUGS = [
        'admin_master',
        'staff_logistic',
        'rlh',
        'rfah',
        'rh',
        'blc',
        'bac',
        'admin_distirbusi',
        'admin_planner',
        'cheker',
        'sac',
        'operator',
    ];

    protected $table = 'roles';

    protected $fillable = [
        'name', 'slug', 'description', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'role_user')
            ->withTimestamps();
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_permission')
            ->withTimestamps();
    }

    protected static function booted(): void
    {
        static::updated(function (Role $role): void {
            // Invalidate permission cache untuk semua user yang memiliki role ini
            $role->users()->pluck('users.id')->each(fn (int $userId) => User::clearPermissionCache($userId));
        });
    }
}
