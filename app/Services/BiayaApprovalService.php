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

    private function notify(Model $biaya, string $trigger): void
    {
        $fresh = $biaya->refresh()->load('submittedBy', 'checkedBy', 'approvedBy', 'rejectedBy', 'revisedBy');
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

        $biaya->update([
            'approval_pengajuan' => $actor->full_name ?: $actor->email,
            'approval_pengajuan_level' => $actor->level,
            'status' => 'pending',
            'submitted_by' => $actor->id,
            'submitted_at' => now(),
            'rejected_by' => null,
            'rejected_at' => null,
            'rejection_reason' => null,
            'revised_by' => null,
            'revised_at' => null,
            'revisi_reason' => null,
        ]);

        $this->notify($biaya, 'submitted');

        return $biaya->refresh();
    }

    public function check(Model $biaya, User $actor): Model
    {
        $this->ensureApprover($biaya, $actor, 'BAC');
        $this->ensureStatus($biaya, ['pending']);

        $biaya->update(['status' => 'checked', 'checked_by' => $actor->id, 'checked_at' => now()]);

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
            ]);
            $this->notify($biaya, 'rlh_approved');

            return $biaya->refresh();
        }

        $biaya->update(['status' => 'approved', 'approved_by' => $actor->id, 'approved_at' => now()]);

        $this->notify($biaya, 'approved');

        return $biaya->refresh();
    }

    public function rfahApprove(Model $biaya, User $actor): Model
    {
        $this->ensureApprover($biaya, $actor, 'RFAH');
        $this->ensureStatus($biaya, ['rlh_approved']);

        $biaya->update(['status' => 'approved', 'approved_by' => $actor->id, 'approved_at' => now()]);

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
        ]);

        $this->notify($biaya, 'revisi');

        return $biaya->refresh();
    }

    private function ensureCreator(Model $biaya, User $actor): void
    {
        abort_unless($biaya->created_by === $actor->id, 403, 'Hanya pembuat pengajuan yang dapat mengirim ulang.');
    }

    private function ensureApprover(Model $biaya, User $actor, string $level): void
    {
        $assigned = ApprovalAssignment::query()
            ->where('kode_depo', $biaya->kode_depo)
            ->where('approval_level', $level)
            ->where('user_id', $actor->id)
            ->where('is_active', true)
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
