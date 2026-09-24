<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RetribusiRate extends Model
{
    protected $fillable = [
        'kode_depo', 'nama_depo', 'mode', 'rate_zak', 'rate_crt', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'rate_zak' => 'decimal:2',
            'rate_crt' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    /**
     * Resolusi logika hitung retribusi depo: baris DB aktif menang,
     * config file sebagai fallback (agar instalasi lama tetap jalan).
     *
     * @return array{mode: string, rate_zak: float, rate_crt: float}
     */
    public static function resolveFor(?string $kodeDepo): array
    {
        if ($kodeDepo) {
            $row = static::query()
                ->where('kode_depo', $kodeDepo)
                ->where('is_active', true)
                ->first();
            if ($row) {
                return [
                    'mode' => $row->mode === 'koli' ? 'koli' : 'borongan',
                    'rate_zak' => (float) $row->rate_zak,
                    'rate_crt' => (float) $row->rate_crt,
                ];
            }
        }

        $cfg = config('biaya.retribusi_depo.'.($kodeDepo ?: ''), config('biaya.retribusi_depo.default', []));

        return [
            'mode' => ($cfg['mode'] ?? 'borongan') === 'koli' ? 'koli' : 'borongan',
            'rate_zak' => (float) ($cfg['rate_zak'] ?? 0),
            'rate_crt' => (float) ($cfg['rate_crt'] ?? 0),
        ];
    }
}
