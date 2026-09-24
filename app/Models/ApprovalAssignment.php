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
            ->with(['user:id,full_name,email'])
            ->first();

        return $assignment?->user?->full_name ?: $assignment?->user?->email;
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
