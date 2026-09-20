<?php

namespace App\Mail;

use App\Models\RencanaKirim;
use App\Models\SjValidation;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SjValidated extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public RencanaKirim $rencanaKirim, public SjValidation $validation) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Dokumen Divalidasi - '.($this->rencanaKirim->po_transporter ?? 'Dokumen'),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.sj-validated',
            with: [
                'rencanaKirim' => $this->rencanaKirim,
                'validation' => $this->validation,
                'items' => $this->validation->items,
            ],
        );
    }
}
