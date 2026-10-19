<?php

namespace Database\Seeders;

use App\Models\ApprovalAssignment;
use App\Models\DepotSetting;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Isi awal penetapan approver biaya (THL & Retribusi) supaya alur approval
 * tidak terkunci pada instalasi baru.
 *
 * Tanpa penetapan, `BiayaApprovalService::ensureApprover()` menolak SEMUA aksi
 * check/approve/revise dengan 403 — termasuk oleh admin — sehingga halaman
 * "Pengaturan Approval" tampil kosong dan tidak ada biaya yang bisa diproses.
 *
 * Aturan:
 * - BLC & BAC diambil dari user aktif ber-level sama **per depo nyata**
 *   (`depot_settings`).
 * - RLH & RFAH dipasang global (`kode_depo = 'ADMIN'`) sebagai approver final
 *   lintas depo, sama seperti yang disimpan UI.
 *
 * Idempoten dan non-destruktif: `firstOrCreate` tidak menimpa penetapan yang
 * sudah diubah manual oleh admin.
 */
class ApprovalAssignmentSeeder extends Seeder
{
    private const LOCAL_LEVELS = ['BLC' => 'blc', 'BAC' => 'bac'];

    private const GLOBAL_LEVELS = ['RLH' => 'rlh', 'RFAH' => 'rfah'];

    public function run(): void
    {
        $modules = [ApprovalAssignment::MODULE_THL, ApprovalAssignment::MODULE_RETRIBUSI];
        $kodeDepos = $this->realDepots();

        foreach ($modules as $module) {
            foreach ($kodeDepos as $kodeDepo) {
                foreach (self::LOCAL_LEVELS as $level => $roleLevel) {
                    $userId = $this->activeUserId($roleLevel, $kodeDepo);
                    if ($userId !== null) {
                        $this->assign($module, $kodeDepo, $level, $userId);
                    }
                }
            }

            foreach (self::GLOBAL_LEVELS as $level => $roleLevel) {
                $userId = $this->globalUserId($roleLevel, $kodeDepos);
                if ($userId !== null) {
                    $this->assign($module, 'ADMIN', $level, $userId);
                }
            }
        }

        $this->command?->info('Approval assignments seeded successfully.');
    }

    /**
     * Depo nyata: dari `depot_settings` bila ada; kalau tabel belum terisi
     * (DB lama), pakai kode_depo user yang benar-benar punya BLC & BAC aktif —
     * ini mengecualikan akun peran seperti ADMIN/BLC-01.
     *
     * @return list<string>
     */
    private function realDepots(): array
    {
        $fromSettings = DepotSetting::query()
            ->where('is_active', true)
            ->pluck('kode_depo')
            ->all();

        if ($fromSettings !== []) {
            return array_values($fromSettings);
        }

        return User::query()
            ->whereNotNull('kode_depo')
            ->whereNotIn('kode_depo', ['', 'ADMIN'])
            ->whereIn('level', array_values(self::LOCAL_LEVELS))
            ->where('status', 'active')
            ->pluck('kode_depo')
            ->unique()
            ->filter(fn (string $kodeDepo): bool => $this->activeUserId('blc', $kodeDepo) !== null
                && $this->activeUserId('bac', $kodeDepo) !== null)
            ->values()
            ->all();
    }

    private function activeUserId(string $level, string $kodeDepo): ?int
    {
        $id = User::query()
            ->where('level', $level)
            ->where('kode_depo', $kodeDepo)
            ->where('status', 'active')
            ->orderBy('id')
            ->value('id');

        return $id === null ? null : (int) $id;
    }

    /**
     * User untuk approver final global: utamakan yang ber-depo nyata (bukan
     * akun peran seperti RLH-01), baru fallback ke user aktif mana pun.
     *
     * @param  list<string>  $realDepots
     */
    private function globalUserId(string $level, array $realDepots): ?int
    {
        $base = User::query()->where('level', $level)->where('status', 'active');

        $id = $realDepots === []
            ? $base->orderBy('id')->value('id')
            : (clone $base)->whereIn('kode_depo', $realDepots)->orderBy('id')->value('id');

        if ($id === null && $realDepots !== []) {
            $id = $base->orderBy('id')->value('id');
        }

        return $id === null ? null : (int) $id;
    }

    private function assign(string $module, string $kodeDepo, string $level, int $userId): void
    {
        ApprovalAssignment::firstOrCreate(
            ['module' => $module, 'kode_depo' => $kodeDepo, 'approval_level' => $level],
            ['user_id' => $userId, 'is_active' => true]
        );
    }
}
