<?php

namespace App\Mail;

use App\Models\Receiving;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ReceivingCompleted extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Receiving $receiving) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Proses Bongkar Selesai - '.($this->receiving->rencanaKirim?->po_transporter ?? 'Receiving'),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.receiving-completed',
            with: [
                'receiving' => $this->receiving,
                'rencanaKirim' => $this->receiving->rencanaKirim,
                'items' => $this->receiving->items,
            ],
        );
    }
}
