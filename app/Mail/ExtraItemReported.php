<?php

namespace App\Mail;

use App\Models\RencanaKirim;
use App\Models\SjValidation;
use App\Models\SjValidationExtraItem;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ExtraItemReported extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public RencanaKirim $rencanaKirim,
        public SjValidation $validation,
        public SjValidationExtraItem $extraItem,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Barang Luar Rencana - '.($this->rencanaKirim->po_transporter ?? 'Dokumen'),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.sj-extra-item',
            with: [
                'rencanaKirim' => $this->rencanaKirim,
                'validation' => $this->validation,
                'extraItem' => $this->extraItem,
            ],
        );
    }
}
