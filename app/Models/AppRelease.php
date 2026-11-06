<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class AppRelease extends Model
{
    protected $fillable = [
        'platform',
        'version_name',
        'version_code',
        'min_supported_code',
        'apk_url',
        'sha256',
        'notes',
        'force',
        'published_at',
    ];

    protected function casts(): array
    {
        return [
            'version_code' => 'integer',
            'min_supported_code' => 'integer',
            'force' => 'boolean',
            'published_at' => 'datetime',
        ];
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('published_at', '<=', now());
    }

    public function scopeForPlatform(Builder $query, string $platform): Builder
    {
        return $query->where('platform', $platform);
    }
}
