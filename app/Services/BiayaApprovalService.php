<?php

namespace App\Services;

use App\Mail\BiayaApprovalNotification;
use App\Models\ApprovalAssignment;
use App\Models\BiayaThl;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class BiayaApprovalService
{
    public function __construct(private EmailNotificationService $emailService) {}

    private function documentTypeFor(Model $biaya): string
    {
        return $biaya instanceof BiayaThl ? 'biaya_thl' : 'biaya_retribusi';
    }

    /**
     * Draft boleh tidak lengkap — antrean tidak boleh. Cermin aturan
     * validateThlRequest (BE) + getMissingFields (FE) untuk Biaya THL;
     * model lain lolos apa adanya.
     */
    private function assertSubmittable(Model $biaya): void
    {
        if (! $biaya instanceof BiayaThl) {
            return;
        }

        $errors = [];
        if (blank($biaya->tanggal_pengajuan)) {
            $errors['tanggal_pengajuan'] = ['Tanggal pengajuan wajib diisi sebelum dikirim.'];
        }

        $details = $biaya->details()->get();
        if ($details->isEmpty()) {
            $errors['details'] = ['Minimal 1 pekerja sebelum dikirim.'];
        }

        foreach ($details as $index => $detail) {
            $prefix = "details.{$index}";
            $position = strtoupper(trim((string) ($detail->posisi ?? '')));
            // Dokumentasi: plat + type per baris untuk semua posisi.
            foreach ([
                'nama_thl' => 'Nama THL',
                'nopol_kendaraan' => 'Plat Kendaraan',
                'type_kendaraan' => 'Type Kendaraan',
            ] as $field => $label) {
                if (blank($detail->{$field})) {
                    $errors["{$prefix}.{$field}"] = ["{$label} wajib diisi sebelum dikirim."];
                }
            }
            if ($detail->nominal_biaya === null || (float) $detail->nominal_biaya < 1) {
                $errors["{$prefix}.nominal_biaya"] = ['Nominal Biaya minimal Rp 1 sebelum dikirim.'];
            }
            if (! in_array($position, ['THL HELPER', 'THL DRIVER', 'THL GUDANG'], true)) {
                $errors["{$prefix}.posisi"] = ['Posisi wajib dipilih sebelum dikirim.'];
            }
            // Dokumentasi §2.1 langkah 6: satu baris valid wajib memiliki satu
            // foto bukti sebelum dikirim.
            if ($detail->photos()->count() < 1) {
                $errors["{$prefix}.photos"] = ["Foto bukti wajib diunggah untuk {$detail->nama_thl} sebelum dikirim."];
            }
            // Checklist kendaraan tambahan: SJ, plat, dan type wajib terisi.
            if (filter_var($detail->kendaraan_tambahan ?? false, FILTER_VALIDATE_BOOLEAN)) {
                foreach (['kendaraan_sj' => 'No. SJ kendaraan', 'kendaraan_nopol' => 'Plat kendaraan tambahan', 'kendaraan_type' => 'Type kendaraan tambahan'] as $field => $label) {
                    if (blank($detail->{$field})) {
                        $errors["{$prefix}.{$field}"] = ["{$label} wajib diisi untuk kendaraan tambahan."];
                    }
                }
            }
            if (in_array($position, ['THL HELPER', 'THL DRIVER'], true)) {
                foreach ([
                    'no_surat_jalan' => 'Nomor Surat Jalan',
                    'driver_name' => 'Nama Driver',
                    'droppoint' => 'Droppoint',
                    'jam_datang' => 'Jam Datang',
                    'jam_pulang' => 'Jam Pulang',
                ] as $field => $label) {
                    if (blank($detail->{$field})) {
                        $errors["{$prefix}.{$field}"] = ["{$label} wajib diisi untuk posisi {$position}."];
                    }
                }
                if ($detail->kubikasi === null || (float) $detail->kubikasi <= 0) {
                    $errors["{$prefix}.kubikasi"] = ["Kubikasi wajib lebih dari 0 untuk posisi {$position}."];
                }
            }
            if ($position === 'THL GUDANG') {
                foreach (['jam_datang' => 'Jam Datang', 'jam_pulang' => 'Jam Pulang'] as $field => $label) {
                    if (blank($detail->{$field})) {
                        $errors["{$prefix}.{$field}"] = ["{$label} wajib diisi untuk posisi {$position}."];
                    }
                }
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    private function notify(Model $biaya, string $trigger): void
    {
        $fresh = $biaya->refresh()->load('submittedBy', 'checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy', 'resubmittedBy');
        $this->emailService->send(
            $this->documentTypeFor($biaya),
            $trigger,
            $fresh,
            new BiayaApprovalNotification($fresh, $trigger)
        );
    }

    public function submit(Model $biaya, User $actor): Model
    {
        $this->ensureCreator($biaya, $actor);
        $this->ensureStatus($biaya, ['draft', 'rejected', 'revisi']);
        $this->assertSubmittable($biaya);

        $isRevisionResubmission = $biaya->status === 'revisi';
        $isThl = $biaya instanceof BiayaThl;
        $resubmissionStatus = $isThl ? $this->revisionReturnStatus($biaya) : 'pending';
        $approvalReset = match ($resubmissionStatus) {
            'pending' => [
                'checked_by' => null, 'checked_at' => null,
                'rlh_approved_by' => null, 'rlh_approved_at' => null,
                'approved_by' => null, 'approved_at' => null,
            ],
            'checked' => [
                'rlh_approved_by' => null, 'rlh_approved_at' => null,
                'approved_by' => null, 'approved_at' => null,
            ],
            'rlh_approved' => [
                'approved_by' => null, 'approved_at' => null,
            ],
            default => [],
        };

        $biaya->update([
            'approval_pengajuan' => $actor->full_name ?: $actor->email,
            'approval_pengajuan_level' => $actor->level,
            'status' => $isRevisionResubmission ? $resubmissionStatus : 'pending',
            'submitted_by' => $actor->id,
            'submitted_at' => now(),
            'rejected_by' => null,
            'rejected_at' => null,
            'rejection_reason' => null,
            ...$approvalReset,
            ...($isRevisionResubmission && $isThl ? [
                'resubmitted_by' => $actor->id,
                'resubmitted_at' => now(),
                'revision_return_status' => null,
            ] : []),
            ...($isRevisionResubmission && ! $isThl ? [
                'revised_by' => null,
                'revised_at' => null,
                'revisi_reason' => null,
            ] : []),
        ]);

        $this->notify($biaya, 'submitted');

        return $biaya->refresh();
    }

    public function check(Model $biaya, User $actor): Model
    {
        $this->ensureApprover($biaya, $actor, 'BAC');
        $this->ensureStatus($biaya, ['pending']);

        $biaya->update(['status' => 'checked', 'checked_by' => $actor->id, 'checked_at' => now(), 'resubmitted_by' => null, 'resubmitted_at' => null]);

        $this->notify($biaya, 'checked');

        return $biaya->refresh();
    }

    public function approve(Model $biaya, User $actor): Model
    {
        $this->ensureApprover($biaya, $actor, 'RLH');
        $this->ensureStatus($biaya, ['checked']);

        if ($biaya->is_rfah_required) {
            $biaya->update([
                'status' => 'rlh_approved',
                'rlh_approved_by' => $actor->id,
                'rlh_approved_at' => now(),
                'resubmitted_by' => null,
                'resubmitted_at' => null,
            ]);
            $this->notify($biaya, 'rlh_approved');

            return $biaya->refresh();
        }

        $biaya->update(['status' => 'approved', 'approved_by' => $actor->id, 'approved_at' => now(), 'resubmitted_by' => null, 'resubmitted_at' => null]);

        $this->notify($biaya, 'approved');

        return $biaya->refresh();
    }

    public function rfahApprove(Model $biaya, User $actor): Model
    {
        $this->ensureApprover($biaya, $actor, 'RFAH');
        $this->ensureStatus($biaya, ['rlh_approved']);

        $biaya->update(['status' => 'approved', 'approved_by' => $actor->id, 'approved_at' => now(), 'resubmitted_by' => null, 'resubmitted_at' => null]);

        $this->notify($biaya, 'approved');

        return $biaya->refresh();
    }

    public function reject(Model $biaya, User $actor, Request $request): Model
    {
        $level = match ($biaya->status) {
            'rlh_approved' => 'RFAH',
            'pending' => 'BAC',
            default => 'RLH',
        };
        $this->ensureApprover($biaya, $actor, $level);
        $this->ensureStatus($biaya, ['pending', 'checked', 'rlh_approved']);
        $reason = $request->validate(['reason' => ['required', 'string', 'max:1000']])['reason'];

        $biaya->update([
            'status' => 'rejected',
            'rejected_by' => $actor->id,
            'rejected_at' => now(),
            'rejection_reason' => $reason,
            'resubmitted_by' => null,
            'resubmitted_at' => null,
        ]);

        $this->notify($biaya, 'rejected');

        return $biaya->refresh();
    }

    public function revise(Model $biaya, User $actor, Request $request): Model
    {
        $this->ensureApprover($biaya, $actor, $biaya->status === 'rlh_approved' ? 'RFAH' : ($biaya->status === 'pending' ? 'BAC' : 'RLH'));
        $this->ensureStatus($biaya, ['pending', 'checked', 'rlh_approved']);
        $reason = $request->validate(['reason' => ['required', 'string', 'max:1000']])['reason'];

        $biaya->update([
            'status' => 'revisi',
            'revised_by' => $actor->id,
            'revised_at' => now(),
            'revisi_reason' => $reason,
            'revision_return_status' => $biaya->status,
            'resubmitted_by' => null,
            'resubmitted_at' => null,
        ]);

        $this->notify($biaya, 'revisi');

        return $biaya->refresh();
    }

    private function ensureCreator(Model $biaya, User $actor): void
    {
        abort_unless($biaya->created_by === $actor->id, 403, 'Hanya pembuat pengajuan yang dapat mengirim ulang.');
    }

    private function revisionReturnStatus(Model $biaya): string
    {
        if (in_array($biaya->revision_return_status, ['checked', 'rlh_approved'], true)) {
            return $biaya->revision_return_status;
        }

        return match (strtoupper((string) $biaya->revisedBy?->level)) {
            'RLH' => 'checked',
            'RFAH' => 'rlh_approved',
            default => 'pending',
        };
    }

    private function ensureApprover(Model $biaya, User $actor, string $level): void
    {
        $assigned = ApprovalAssignment::query()
            ->where('user_id', $actor->id)
            ->where('approval_level', $level)
            ->where('is_active', true)
            ->where(function ($query) use ($biaya, $level): void {
                $query->where('kode_depo', $biaya->kode_depo);
                if (in_array($level, ['RLH', 'RFAH'], true)) {
                    $query->orWhere('kode_depo', 'ADMIN');
                }
            })
            ->exists();
        abort_unless($assigned, 403, 'Anda bukan approver yang ditetapkan untuk depo ini.');
    }

    private function ensureStatus(Model $biaya, array $allowed): void
    {
        if (! in_array($biaya->status, $allowed, true)) {
            throw ValidationException::withMessages(['status' => 'Status pengajuan tidak dapat diproses pada tahap ini.']);
        }
    }
}
