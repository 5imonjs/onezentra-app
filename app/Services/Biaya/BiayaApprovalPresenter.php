<?php

namespace App\Services\Biaya;

use App\Models\BiayaRetribusi;
use App\Models\BiayaThl;
use App\Services\ApprovalSectionResolver;

/**
 * Presentasi approval untuk PDF & detail API: penempatan cap audit, nama
 * pelaku per kotak, dan susunan `approval_sections`.
 *
 * THL dan Retribusi punya aturan siklus approval yang berbeda (THL mengenal
 * RFAH dua tanda tangan: RLH lalu RFAH), sehingga cap diselesaikan per model
 * alih-alih dipaksa satu bentuk. Aturan tiap model dipertahankan apa adanya.
 */
class BiayaApprovalPresenter
{
    /**
     * Susunan kotak approval untuk view PDF & respons detail, sudah difilter
     * agar kotak RFAH* hanya muncul saat pengajuan memang butuh RFAH.
     *
     * @return array<int, array{title: string, people: array<int, array{name: string, role: string}>}>
     */
    public function approvalSectionsFor(object $row, string $module): array
    {
        $names = $row instanceof BiayaThl
            ? $this->actorNamesThl($row)
            : $this->actorNamesRetribusi($row);

        $sections = app(ApprovalSectionResolver::class)->resolve(
            $row->kode_depo ?: '',
            $names['submitter'],
            $names['checker'],
            $names['approver'],
            $names['rfah'],
            $module,
        );

        return array_values(array_filter(
            $sections,
            fn (array $section): bool => $section['title'] !== 'RFAH*' || $row->is_rfah_required,
        ));
    }

    /**
     * @return array<string, array{text: string, color: string, date: string|null}>
     */
    public function resolveThl(BiayaThl $biayaThl): array
    {
        $stamps = [];

        if ($biayaThl->status !== 'draft' && $biayaThl->submitted_at) {
            $stamps['Mengajukan'] = [
                'text' => 'PENGAJUAN',
                'color' => '#dc2626',
                'date' => $biayaThl->submitted_at?->format('d M Y'),
            ];
        }

        if ($biayaThl->checked_at) {
            $stamps['Mengetahui'] = [
                'text' => 'DIPERIKSA',
                'color' => '#dc2626',
                'date' => $biayaThl->checked_at->format('d M Y'),
            ];
        }

        if ($biayaThl->status === 'rlh_approved' && $biayaThl->rlh_approved_at) {
            $stamps['Menyetujui'] = [
                'text' => 'DISETUJUI RLH',
                'color' => '#dc2626',
                'date' => $biayaThl->rlh_approved_at->format('d M Y'),
            ];
        } elseif ($biayaThl->status === 'approved' && $biayaThl->approved_at && $biayaThl->approvedBy) {
            $stamps['Menyetujui'] = [
                'text' => 'DISETUJUI',
                'color' => '#dc2626',
                'date' => $biayaThl->approved_at?->format('d M Y'),
            ];
            if ($biayaThl->is_rfah_required && $biayaThl->rlh_approved_at && $biayaThl->rlhApprovedBy) {
                $stamps['Menyetujui'] = [
                    'text' => 'DISETUJUI',
                    'color' => '#dc2626',
                    'date' => $biayaThl->rlh_approved_at->format('d M Y'),
                ];
                $stamps['RFAH*'] = [
                    'text' => 'DISETUJUI RFAH',
                    'color' => '#dc2626',
                    'date' => $biayaThl->approved_at->format('d M Y'),
                ];
            }
        } elseif ($biayaThl->status === 'rejected' && $biayaThl->rejected_at && $biayaThl->rejectedBy) {
            $actorSection = $this->stampSectionFor((string) $biayaThl->rejectedBy?->level);
            $stamps[$actorSection] = [
                'text' => 'DITOLAK',
                'color' => '#dc2626',
                'date' => $biayaThl->rejected_at?->format('d M Y'),
            ];
            // Persetujuan RLH pada siklus sebelumnya tetap tercatat di kotaknya
            // bila aksi terminal (ditolak) dilakukan pelaku lain (BAC/RFAH).
            if ($actorSection !== 'Menyetujui' && $biayaThl->rlh_approved_at && $biayaThl->rlhApprovedBy) {
                $stamps['Menyetujui'] = [
                    'text' => 'DISETUJUI RLH',
                    'color' => '#dc2626',
                    'date' => $biayaThl->rlh_approved_at->format('d M Y'),
                ];
            }
        } elseif ($biayaThl->status === 'revisi' && $biayaThl->revised_at && $biayaThl->revisedBy) {
            $actorSection = $this->stampSectionFor((string) $biayaThl->revisedBy?->level);
            $stamps[$actorSection] = [
                'text' => 'REVISI',
                'color' => '#d97706',
                'date' => $biayaThl->revised_at?->format('d M Y'),
            ];
            if ($actorSection !== 'Menyetujui' && $biayaThl->rlh_approved_at && $biayaThl->rlhApprovedBy) {
                $stamps['Menyetujui'] = [
                    'text' => 'DISETUJUI RLH',
                    'color' => '#dc2626',
                    'date' => $biayaThl->rlh_approved_at->format('d M Y'),
                ];
            }
        }

        return $stamps;
    }

    /**
     * @return array<string, array{text: string, color: string, date: string|null}>
     */
    public function resolveRetribusi(BiayaRetribusi $biayaRetribusi): array
    {
        $stamps = [];

        if ($biayaRetribusi->status !== 'draft') {
            $stamps['Mengajukan'] = [
                'text' => 'PENGAJUAN',
                'color' => '#dc2626',
                'date' => $biayaRetribusi->submitted_at?->format('d M Y'),
            ];
        }

        if ($biayaRetribusi->checked_at) {
            $stamps['Mengetahui'] = [
                'text' => 'DIPERIKSA',
                'color' => '#dc2626',
                'date' => $biayaRetribusi->checked_at->format('d M Y'),
            ];
        }

        if ($biayaRetribusi->status === 'approved') {
            $stamps['Menyetujui'] = [
                'text' => 'DISETUJUI',
                'color' => '#dc2626',
                'date' => $biayaRetribusi->approved_at?->format('d M Y'),
            ];
        } elseif ($biayaRetribusi->status === 'rejected') {
            $actorSection = $this->stampSectionFor((string) $biayaRetribusi->rejectedBy?->level);
            $stamps[$actorSection] = [
                'text' => 'DITOLAK',
                'color' => '#dc2626',
                'date' => $biayaRetribusi->rejected_at?->format('d M Y'),
            ];
            // Persetujuan RLH pada siklus sebelumnya tetap tercatat di kotaknya
            // bila aksi terminal (ditolak) dilakukan pelaku lain (BAC/RFAH).
            if ($actorSection !== 'Menyetujui' && $biayaRetribusi->rlh_approved_at && $biayaRetribusi->rlhApprovedBy) {
                $stamps['Menyetujui'] = [
                    'text' => 'DISETUJUI RLH',
                    'color' => '#dc2626',
                    'date' => $biayaRetribusi->rlh_approved_at->format('d M Y'),
                ];
            }
        } elseif ($biayaRetribusi->status === 'revisi') {
            $actorSection = $this->stampSectionFor((string) $biayaRetribusi->revisedBy?->level);
            $stamps[$actorSection] = [
                'text' => 'REVISI',
                'color' => '#d97706',
                'date' => $biayaRetribusi->revised_at?->format('d M Y'),
            ];
            if ($actorSection !== 'Menyetujui' && $biayaRetribusi->rlh_approved_at && $biayaRetribusi->rlhApprovedBy) {
                $stamps['Menyetujui'] = [
                    'text' => 'DISETUJUI RLH',
                    'color' => '#dc2626',
                    'date' => $biayaRetribusi->rlh_approved_at->format('d M Y'),
                ];
            }
        }

        return $stamps;
    }

    /**
     * Kotak kolom approval tempat cap REVISI/DITOLAK diletakkan mengikuti
     * peran pelaku aksi: BAC -> Mengetahui, RFAH -> RFAH*, selainnya
     * (RLH / data lama tanpa level) -> Menyetujui. Sejajar dengan
     * stampSectionFor() pada generator PDF frontend.
     */
    public function stampSectionFor(string $level): string
    {
        return match (strtoupper($level)) {
            'BAC' => 'Mengetahui',
            'RFAH' => 'RFAH*',
            default => 'Menyetujui',
        };
    }

    /**
     * Nama pelaku per kotak approval THL, diurutkan sesuai ApprovalSectionResolver:
     * submitter (BLC), checker (BAC), approver (RLH), rfah (RFAH*). Nama
     * mengikuti peran pelaku aksi — revisi/ditolak oleh RFAH atau BAC tidak
     * boleh tertukar ke kotak RLH.
     *
     * @return array{submitter: ?string, checker: ?string, approver: ?string, rfah: ?string}
     */
    public function actorNamesThl(BiayaThl $biayaThl): array
    {
        $submitter = $biayaThl->submittedBy?->full_name ?: $biayaThl->approval_pengajuan;
        $checker = $biayaThl->checkedBy?->full_name;
        $approver = null;
        $rfah = null;

        if ($biayaThl->status === 'rlh_approved') {
            $approver = $biayaThl->rlhApprovedBy?->full_name;
        } elseif ($biayaThl->status === 'approved') {
            if ($biayaThl->is_rfah_required) {
                $approver = $biayaThl->rlhApprovedBy?->full_name;
                $rfah = $biayaThl->approvedBy?->full_name;
            } else {
                $approver = $biayaThl->approvedBy?->full_name;
            }
        } elseif (in_array($biayaThl->status, ['rejected', 'revisi'], true)) {
            $actor = $biayaThl->status === 'rejected' ? $biayaThl->rejectedBy : $biayaThl->revisedBy;
            match (strtoupper((string) ($actor?->level ?? ''))) {
                'BAC' => $checker = $actor?->full_name,
                'RFAH' => $rfah = $actor?->full_name,
                default => $approver = $actor?->full_name,
            };
        }

        return ['submitter' => $submitter, 'checker' => $checker, 'approver' => $approver, 'rfah' => $rfah];
    }

    /**
     * @return array{submitter: ?string, checker: ?string, approver: ?string, rfah: ?string}
     */
    public function actorNamesRetribusi(BiayaRetribusi $biayaRetribusi): array
    {
        $submitter = $biayaRetribusi->approval_pengajuan;
        $checker = $biayaRetribusi->checkedBy?->full_name;
        $approver = null;
        $rfah = null;

        if ($biayaRetribusi->status === 'rlh_approved') {
            $approver = $biayaRetribusi->rlhApprovedBy?->full_name;
        } elseif ($biayaRetribusi->status === 'approved') {
            if ($biayaRetribusi->is_rfah_required) {
                $approver = $biayaRetribusi->rlhApprovedBy?->full_name;
                $rfah = $biayaRetribusi->approvedBy?->full_name;
            } else {
                $approver = $biayaRetribusi->approvedBy?->full_name;
            }
        } elseif (in_array($biayaRetribusi->status, ['rejected', 'revisi'], true)) {
            $actor = $biayaRetribusi->status === 'rejected' ? $biayaRetribusi->rejectedBy : $biayaRetribusi->revisedBy;
            match (strtoupper((string) ($actor?->level ?? ''))) {
                'BAC' => $checker = $actor?->full_name,
                'RFAH' => $rfah = $actor?->full_name,
                default => $approver = $actor?->full_name,
            };
        }

        return ['submitter' => $submitter, 'checker' => $checker, 'approver' => $approver, 'rfah' => $rfah];
    }
}
