<?php

namespace App\Mail;

use App\Models\SjValidationExtraItem;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Pemberitahuan keputusan atas barang di luar rencana (Fase 2): planner
 * menyetujui/menolak catatan deviasi operator. Penerima diatur admin lewat
 * menu Penerima Email (dokumen `sj_ba`, trigger `extra_item_decision`).
 */
class ExtraItemDecision extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public SjValidationExtraItem $extraItem,
        public string $decision,
    ) {}

    public function envelope(): Envelope
    {
        $verb = $this->decision === 'APPROVED' ? 'Disetujui' : 'Ditolak';

        return new Envelope(
            subject: "Barang Luar Rencana {$verb} - {$this->extraItem->nama_barang}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.sj-extra-item-decision',
            with: [
                'extraItem' => $this->extraItem,
                'decision' => $this->decision,
            ],
        );
    }
}
