<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Dock extends Model
{
    protected $fillable = [
        'name', 'code', 'kode_depo', 'nama_depo', 'status', 'capacity', 'notes',
    ];

    public function receivings(): HasMany
    {
        return $this->hasMany(Receiving::class);
    }
}
