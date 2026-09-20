<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmailSetting extends Model
{
    protected $fillable = [
        'mailer', 'host', 'port', 'username', 'password',
        'encryption', 'from_address', 'from_name',
        'from_system_env', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'port' => 'integer',
            'from_system_env' => 'boolean',
            'is_active' => 'boolean',
            'password' => 'encrypted',
        ];
    }
}
