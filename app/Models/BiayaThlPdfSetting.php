<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BiayaThlPdfSetting extends Model
{
    protected $table = 'biaya_thl_pdf_settings';

    protected $fillable = [
        'kode_depo',
        'approval_sections',
    ];

    protected function casts(): array
    {
        return [
            'approval_sections' => 'array',
        ];
    }
}
