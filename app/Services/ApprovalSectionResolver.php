<?php

namespace App\Services;

class ApprovalSectionResolver
{
    private const LEVELS = ['BLC', 'BAC', 'RLH', 'RFAH'];

    /**
     * Nama pada kolom approval mencerminkan AKSI yang sudah terjadi, bukan
     * daftar assignee. Tanpa nama aktual (belum ada aksi), kolom menampilkan
     * '-' dengan role tetap tertera — PDF draft tidak boleh terlihat
     * seolah sudah diperiksa/disetujui.
     */
    public function resolve(string $kodeDepo, ?string $submitterName = null, ?string $checkerName = null, ?string $approverName = null, ?string $rfahName = null): array
    {
        return collect(self::LEVELS)->map(function (string $level) use ($submitterName, $checkerName, $approverName, $rfahName): array {
            $actualName = match ($level) {
                'BLC' => $submitterName,
                'BAC' => $checkerName,
                'RLH' => $approverName,
                'RFAH' => $rfahName,
            };

            return [
                'title' => $this->titleFor($level),
                'people' => [['name' => $actualName ?: '-', 'role' => $level]],
            ];
        })->all();
    }

    private function titleFor(string $level): string
    {
        return match ($level) {
            'BLC' => 'Mengajukan',
            'BAC' => 'Mengetahui',
            'RLH' => 'Menyetujui',
            'RFAH' => 'RFAH*',
        };
    }
}
