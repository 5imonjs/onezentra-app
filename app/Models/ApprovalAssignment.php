<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalAssignment extends Model
{
    protected $fillable = ['kode_depo', 'approval_level', 'user_id', 'is_active'];

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
    public static function approverName(string $level, ?string $kodeDepo): ?string
    {
        if (blank($kodeDepo)) {
            return null;
        }

        $assignment = self::query()
            ->where('kode_depo', $kodeDepo)
            ->where('approval_level', $level)
            ->where('is_active', true)
            ->with(['user:id,full_name,email'])
            ->first();

        return $assignment?->user?->full_name ?: $assignment?->user?->email;
    }

    /**
     * Nama RFAH untuk satu depo: assignment aktif, jatuh ke config global
     * bila depo belum punya penanggung jawab RFAH.
     */
    public static function resolveRfahName(?string $kodeDepo): string
    {
        return self::approverName('RFAH', $kodeDepo) ?? config('biaya.rfah_name', 'Umi Marzuqoh');
    }
}
