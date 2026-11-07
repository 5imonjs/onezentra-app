<?php

namespace App\Mail;

use App\Models\GateTransaction;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class GateCheckedIn extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public GateTransaction $gateTransaction) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Check In Gate Selesai - '.($this->gateTransaction->rencanaKirim?->po_transporter ?? 'Gate'),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.gate-checked-in',
            with: [
                'gateTransaction' => $this->gateTransaction,
                'rencanaKirim' => $this->gateTransaction->rencanaKirim,
            ],
        );
    }
}
