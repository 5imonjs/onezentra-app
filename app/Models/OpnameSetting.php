<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OpnameSetting extends Model
{
    protected $fillable = ['key', 'value'];

    public static function get(string $key, int $default): int
    {
        return (int) (self::where('key', $key)->value('value') ?? $default);
    }

    public static function set(string $key, int $value): void
    {
        self::updateOrCreate(['key' => $key], ['value' => $value]);
    }
}
