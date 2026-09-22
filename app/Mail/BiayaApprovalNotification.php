<?php

namespace App\Mail;

use App\Models\BiayaRetribusi;
use App\Models\BiayaThl;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class BiayaApprovalNotification extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public BiayaThl|BiayaRetribusi $biaya, public string $trigger) {}

    public function subjectLabel(): string
    {
        return match ($this->trigger) {
            'submitted' => 'Diajukan',
            'checked' => 'Diperiksa',
            'rlh_approved' => 'Disetujui RLH',
            'approved' => 'Disetujui',
            'rejected' => 'Ditolak',
            'revisi' => 'Perlu Revisi',
            default => ucfirst($this->trigger),
        };
    }

    public function actorName(): ?string
    {
        return match ($this->trigger) {
            'submitted' => $this->biaya->submittedBy?->full_name,
            'checked' => $this->biaya->checkedBy?->full_name,
            'rlh_approved' => $this->biaya->rlhApprovedBy?->full_name,
            'approved' => $this->biaya->approvedBy?->full_name,
            'rejected' => $this->biaya->rejectedBy?->full_name,
            'revisi' => $this->biaya->revisedBy?->full_name,
            default => null,
        };
    }

    public function actorTime(): ?string
    {
        $stamp = match ($this->trigger) {
            'submitted' => $this->biaya->submitted_at,
            'checked' => $this->biaya->checked_at,
            'rlh_approved' => $this->biaya->rlh_approved_at,
            'approved' => $this->biaya->approved_at,
            'rejected' => $this->biaya->rejected_at,
            'revisi' => $this->biaya->revised_at,
            default => null,
        };

        return $stamp?->format('d-m-Y H:i');
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Biaya '.$this->subjectLabel().' - '.($this->biaya->nama_depo ?? $this->biaya->kode_depo ?? 'Pengajuan'),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.biaya-approval-status',
            with: [
                'biaya' => $this->biaya,
                'moduleLabel' => $this->biaya instanceof BiayaThl ? 'Biaya THL' : 'Biaya Retribusi',
                'subjectLabel' => $this->subjectLabel(),
                'actorName' => $this->actorName(),
                'actorTime' => $this->actorTime(),
            ],
        );
    }
}
