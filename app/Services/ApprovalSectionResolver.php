<?php

namespace App\Services;

use App\Models\ApprovalAssignment;

class ApprovalSectionResolver
{
    private const LEVELS = ['BLC', 'BAC', 'RLH', 'RFAH'];

    public function resolve(string $kodeDepo, ?string $submitterName = null, ?string $checkerName = null, ?string $approverName = null, ?string $rfahName = null): array
    {
        $assignments = ApprovalAssignment::query()
            ->with('user')
            ->where('kode_depo', $kodeDepo)
            ->where('is_active', true)
            ->get()
            ->keyBy('approval_level');
        $defaults = config('biaya_thl_pdf.approval_sections', []);

        return collect(self::LEVELS)->map(function (string $level) use ($assignments, $defaults, $submitterName, $checkerName, $approverName, $rfahName): array {
            $assignment = $assignments->get($level);
            $default = collect($defaults)->firstWhere('title', $this->titleFor($level));
            $actualName = match ($level) {
                'BLC' => $submitterName,
                'BAC' => $checkerName,
                'RLH' => $approverName,
                'RFAH' => $rfahName,
            };
            $name = $actualName
                ?: $assignment?->user?->full_name
                ?: data_get($default, 'people.0.name', '-');

            return [
                'title' => $this->titleFor($level),
                'people' => [['name' => $name ?: '-', 'role' => $level]],
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
