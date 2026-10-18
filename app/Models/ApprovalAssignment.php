<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalAssignment extends Model
{
    public const MODULE_THL = 'biaya_thl';

    public const MODULE_RETRIBUSI = 'biaya_retribusi';

    protected $fillable = ['module', 'kode_depo', 'approval_level', 'user_id', 'is_active'];

    protected function casts(): array
    {
        return ['user_id' => 'integer', 'is_active' => 'boolean'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Nama penanggung jawab level approval untuk satu depo: user yang
     * di-assign aktif pada level tersebut. Null bila belum di-assign.
     */
    public static function moduleFor(object $biaya): string
    {
        return $biaya instanceof BiayaThl ? self::MODULE_THL : self::MODULE_RETRIBUSI;
    }

    /**
     * Nama penanggung jawab level approval dengan fallback berlapis agar
     * kolom approval di PDF tidak kosong:
     * 1. Assignment aktif di depo tersebut (prioritas depo > ADMIN).
     * 2. User aktif ber-role level tersebut di depo yang sama.
     * 3. Nama default dari config biaya.{blc,bac,rlh,rfah}_name.
     */
    public static function approverName(string $level, ?string $kodeDepo, string $module = self::MODULE_THL): ?string
    {
        if (blank($kodeDepo)) {
            return null;
        }

        $globalLevel = in_array($level, ['RLH', 'RFAH'], true);
        $assignment = self::query()
            ->where('module', $module)
            ->where(function ($query) use ($kodeDepo, $globalLevel): void {
                $query->where('kode_depo', $kodeDepo);
                if ($globalLevel) {
                    $query->orWhere('kode_depo', 'ADMIN');
                }
            })
            ->where('approval_level', $level)
            ->where('is_active', true)
            ->orderByRaw('CASE WHEN kode_depo = ? THEN 0 ELSE 1 END', [$kodeDepo])
            ->orderBy('id')
            ->with(['user:id,full_name,email'])
            ->first();

        if ($assignment?->user) {
            return $assignment->user->full_name ?: $assignment->user->email;
        }

        $roleSlug = match (strtoupper($level)) {
            'BLC' => 'blc',
            'BAC' => 'bac',
            'RLH' => 'rlh',
            'RFAH' => 'rfah',
            default => strtolower($level),
        };

        $fallbackUser = User::whereHas('roles', fn ($q) => $q->where('slug', $roleSlug))
            ->where('kode_depo', $kodeDepo)
            ->where('status', 'active')
            ->whereNotNull('email')
            ->where('email', '<>', '')
            ->first();

        if ($fallbackUser) {
            return $fallbackUser->full_name ?: $fallbackUser->email;
        }

        $configKey = match (strtoupper($level)) {
            'BLC' => 'biaya.blc_name',
            'BAC' => 'biaya.bac_name',
            'RLH' => 'biaya.rlh_name',
            'RFAH' => 'biaya.rfah_name',
            default => null,
        };

        if ($configKey && config($configKey)) {
            return config($configKey);
        }

        return null;
    }

    /**
     * Nama RFAH untuk satu depo: assignment aktif, jatuh ke config global
     * bila depo belum punya penanggung jawab RFAH.
     */
    public static function resolveRfahName(?string $kodeDepo, string $module = self::MODULE_THL): string
    {
        return self::approverName('RFAH', $kodeDepo, $module) ?? config('biaya.rfah_name', 'Umi Marzuqoh');
    }
}
