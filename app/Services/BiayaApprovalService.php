<?php

namespace App\Services;

use App\Mail\BiayaApprovalNotification;
use App\Models\ApprovalAssignment;
use App\Models\ApprovalHistory;
use App\Models\BiayaRetribusi;
use App\Models\BiayaThl;
use App\Models\RetribusiRate;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
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
        if ($biaya instanceof BiayaRetribusi) {
            $this->assertRetribusiSubmittable($biaya);

            return;
        }
        if (! $biaya instanceof BiayaThl) {
            return;
        }

        $errors = [];
        if (blank($biaya->tanggal_pengajuan)) {
            $errors['tanggal_pengajuan'] = ['Tanggal pengajuan wajib diisi sebelum dikirim.'];
        }
        // Tanpa depo, pengajuan tak cocok ke ApprovalAssignment mana pun
        // dan tak terlihat di filter depo mana pun — tolak sejak submit.
        if (blank($biaya->kode_depo)) {
            $errors['kode_depo'] = ['Depo wajib diisi sebelum dikirim.'];
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
            // Paritas dengan FE: durasi kerja maksimal 18 jam.
            if (! blank($detail->jam_datang) && ! blank($detail->jam_pulang)) {
                $datang = strtotime((string) $detail->jam_datang);
                $pulang = strtotime((string) $detail->jam_pulang);
                if ($datang && $pulang && $pulang > $datang && ($pulang - $datang) > 18 * 3600) {
                    $errors["{$prefix}.jam_pulang"] = ['Durasi kerja melebihi 18 jam — periksa kembali jam datang/pulang.'];
                }
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    /**
     * Kelengkapan pengajuan retribusi sebelum dikirim: tanggal, minimal
     * 1 baris, tiap baris berplat + bertype + bernominal, dan qty > 0
     * untuk depo mode koli.
     */
    private function assertRetribusiSubmittable(BiayaRetribusi $biaya): void
    {
        $errors = [];
        if (blank($biaya->tanggal_pengajuan)) {
            $errors['tanggal_pengajuan'] = ['Tanggal pengajuan wajib diisi sebelum dikirim.'];
        }
        // Tanpa depo, pengajuan tak cocok ke ApprovalAssignment mana pun
        // dan tak terlihat di filter depo mana pun — tolak sejak submit.
        if (blank($biaya->kode_depo)) {
            $errors['kode_depo'] = ['Depo wajib diisi sebelum dikirim.'];
        }

        $details = $biaya->details()->get();
        if ($details->isEmpty()) {
            $errors['details'] = ['Minimal 1 baris biaya sebelum dikirim.'];
        }
        if ($biaya->documents()->count() < 1) {
            $errors['documents'] = ['Minimal 1 dokumen lampiran (PDF/foto) sebelum dikirim.'];
        }

        $calc = RetribusiRate::resolveFor($biaya->kode_depo);
        foreach ($details as $index => $detail) {
            $prefix = "details.{$index}";
            foreach ([
                'nopol_kendaraan' => 'Plat Kendaraan',
                'type_kendaraan' => 'Type Kendaraan',
            ] as $field => $label) {
                if (blank($detail->{$field})) {
                    $errors["{$prefix}.{$field}"] = ["{$label} wajib diisi sebelum dikirim."];
                }
            }
            if ($calc['mode'] === 'koli'
                && (float) ($detail->qty_zak ?? 0) + (float) ($detail->qty_crt ?? 0) <= 0) {
                $errors["{$prefix}.qty"] = ['Qty zak/crt wajib lebih dari 0 untuk depo mode koli sebelum dikirim.'];
            }
            if ($detail->nominal_biaya === null || (float) $detail->nominal_biaya < 1) {
                $errors["{$prefix}.nominal_biaya"] = ['Nominal Biaya minimal Rp 1 sebelum dikirim.'];
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    /**
     * Catat jejak audit append-only setiap transisi approval agar catatan
     * revisi/ditolak dan riwayat aksi tak hilang ditimpa siklus berikutnya.
     */
    private function recordHistory(Model $biaya, ?string $from, string $action, ?string $reason, User $actor): void
    {
        ApprovalHistory::create([
            'subject_type' => $biaya::class,
            'subject_id' => $biaya->getKey(),
            'from_status' => $from,
            'to_status' => $biaya->status,
            'action' => $action,
            'reason' => $reason,
            'actor_id' => $actor->id,
        ]);
    }

    private function notify(Model $biaya, string $trigger): void
    {
        $fresh = $biaya->refresh()->load('submittedBy', 'checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy', 'resubmittedBy');
        $this->emailService->send(
            $this->documentTypeFor($biaya),
            $trigger,
            $fresh,
            new BiayaApprovalNotification($fresh, $trigger),
            $fresh->kode_depo
        );
    }

    public function submit(Model $biaya, User $actor): Model
    {
        $this->ensureCreator($biaya, $actor);
        $this->ensureStatus($biaya, ['draft', 'rejected', 'revisi']);
        $this->assertSubmittable($biaya);

        $refreshed = $this->persistTransition(
            $biaya,
            ['draft', 'rejected', 'revisi'],
            'submit',
            $actor,
            function (Model $locked) use ($actor): void {
                $isRevisionResubmission = $locked->status === 'revisi';
                // Status kembali memakai jejak yang sama untuk THL maupun
                // retribusi (revision_return_status, fallback level perevisi):
                // progres approval yang sudah dicapai tidak hilang sia-sia.
                $resubmissionStatus = $isRevisionResubmission
                    ? $this->revisionReturnStatus($locked)
                    : 'pending';
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

                $locked->update([
                    'approval_pengajuan' => $actor->full_name ?: $actor->email,
                    'approval_pengajuan_level' => $actor->level,
                    'status' => $isRevisionResubmission ? $resubmissionStatus : 'pending',
                    'submitted_by' => $actor->id,
                    'submitted_at' => now(),
                    'rejected_by' => null,
                    'rejected_at' => null,
                    'rejection_reason' => null,
                    ...$approvalReset,
                    ...($isRevisionResubmission ? [
                        'resubmitted_by' => $actor->id,
                        'resubmitted_at' => now(),
                        'revision_return_status' => null,
                    ] : []),
                ]);
            },
        );

        // JANGAN panggil notify() di sini agar submit tidak terblokir email
        // email akan dikirim secara async oleh worker antrean setelah response terkirim
        return $refreshed;
    }

    public function check(Model $biaya, User $actor): Model
    {
        $this->ensureApprover($biaya, $actor, 'BAC');

        $refreshed = $this->persistTransition(
            $biaya,
            ['pending'],
            'check',
            $actor,
            function (Model $locked) use ($actor): void {
                $locked->update([
                    'status' => 'checked',
                    'checked_by' => $actor->id,
                    'checked_at' => now(),
                    'resubmitted_by' => null,
                    'resubmitted_at' => null,
                ]);
            },
        );

        $this->notify($refreshed, 'checked');

        return $refreshed;
    }

    public function approve(Model $biaya, User $actor): Model
    {
        $this->ensureApprover($biaya, $actor, 'RLH');

        $trigger = 'approved';
        $refreshed = $this->persistTransition(
            $biaya,
            ['checked'],
            'approve',
            $actor,
            function (Model $locked) use ($actor, &$trigger): void {
                if ($locked->is_rfah_required) {
                    $trigger = 'rlh_approved';
                    $locked->update([
                        'status' => 'rlh_approved',
                        'rlh_approved_by' => $actor->id,
                        'rlh_approved_at' => now(),
                        'resubmitted_by' => null,
                        'resubmitted_at' => null,
                    ]);

                    return;
                }

                $locked->update([
                    'status' => 'approved',
                    'approved_by' => $actor->id,
                    'approved_at' => now(),
                    'resubmitted_by' => null,
                    'resubmitted_at' => null,
                ]);
            },
        );

        $this->notify($refreshed, $trigger);

        return $refreshed;
    }

    public function rfahApprove(Model $biaya, User $actor): Model
    {
        $this->ensureApprover($biaya, $actor, 'RFAH');

        $refreshed = $this->persistTransition(
            $biaya,
            ['rlh_approved'],
            'rfah_approve',
            $actor,
            function (Model $locked) use ($actor): void {
                $locked->update([
                    'status' => 'approved',
                    'approved_by' => $actor->id,
                    'approved_at' => now(),
                    'resubmitted_by' => null,
                    'resubmitted_at' => null,
                ]);
            },
        );

        $this->notify($refreshed, 'approved');

        return $refreshed;
    }

    public function reject(Model $biaya, User $actor, string $reason): Model
    {
        $level = match ($biaya->status) {
            'rlh_approved' => 'RFAH',
            'pending' => 'BAC',
            default => 'RLH',
        };
        $this->ensureApprover($biaya, $actor, $level);

        $refreshed = $this->persistTransition(
            $biaya,
            ['pending', 'checked', 'rlh_approved'],
            'reject',
            $actor,
            function (Model $locked) use ($actor, $reason): void {
                $locked->update([
                    'status' => 'rejected',
                    'rejected_by' => $actor->id,
                    'rejected_at' => now(),
                    'rejection_reason' => $reason,
                    'resubmitted_by' => null,
                    'resubmitted_at' => null,
                ]);
            },
            $reason,
        );

        $this->notify($refreshed, 'rejected');

        return $refreshed;
    }

    public function revise(Model $biaya, User $actor, string $reason): Model
    {
        $this->ensureApprover($biaya, $actor, $biaya->status === 'rlh_approved' ? 'RFAH' : ($biaya->status === 'pending' ? 'BAC' : 'RLH'));

        $refreshed = $this->persistTransition(
            $biaya,
            ['pending', 'checked', 'rlh_approved'],
            'revise',
            $actor,
            function (Model $locked) use ($actor, $reason): void {
                $locked->update([
                    'status' => 'revisi',
                    'revised_by' => $actor->id,
                    'revised_at' => now(),
                    'revisi_reason' => $reason,
                    'revision_return_status' => $locked->status,
                    'resubmitted_by' => null,
                    'resubmitted_at' => null,
                ]);
            },
            $reason,
        );

        $this->notify($refreshed, 'revisi');

        return $refreshed;
    }

    private function ensureCreator(Model $biaya, User $actor): void
    {
        abort_unless($biaya->created_by === $actor->id, 403, 'Hanya pembuat pengajuan yang dapat mengirim ulang.');
    }

    /**
     * Jalankan transisi approval secara atomik: kunci baris (lockForUpdate)
     * agar dua permintaan paralel tidak sama-sama lolos validasi status lalu
     * saling menimpa jejak, validasi status ulang di dalam transaksi, dan
     * catat ApprovalHistory pada transaksi yang sama dengan perubahan status.
     *
     * @param  array<int, string>  $allowed
     * @param  \Closure(Model): void  $apply
     */
    private function persistTransition(Model $biaya, array $allowed, string $action, User $actor, \Closure $apply, ?string $reason = null): Model
    {
        $result = DB::transaction(function () use ($biaya, $allowed, $action, $actor, $apply, $reason): Model {
            /** @var Model $locked */
            $locked = $biaya->newQuery()->lockForUpdate()->findOrFail($biaya->getKey());

            $this->ensureStatus($locked, $allowed);
            $from = $locked->status;

            $apply($locked);

            $refreshed = $locked->refresh();
            $this->recordHistory($refreshed, $from, $action, $reason, $actor);

            return $refreshed;
        }, 5);

        // Sinkronkan instance pemanggil agar status terbaru terlihat dari luar
        // transaksi (perilaku lama memperbarui instance yang sama).
        $biaya->setRawAttributes($result->getAttributes(), true);
        $biaya->syncOriginal();

        return $result;
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
        // Segregasi tugas: pembuat pengajuan tidak boleh memproses
        // pengajuannya sendiri di sisi approval (check/approve/rfah/reject/revise).
        abort_if($biaya->created_by === $actor->id, 403, 'Pembuat pengajuan tidak boleh memproses pengajuannya sendiri.');

        $assigned = ApprovalAssignment::query()
            ->where('module', ApprovalAssignment::moduleFor($biaya))
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
