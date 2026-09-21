<?php

namespace App\Mail;

use App\Models\RencanaKirim;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class RencanaKirimCancelled extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public RencanaKirim $rencanaKirim) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Rencana Kirim Dibatalkan - '.($this->rencanaKirim->po_transporter ?? 'PO Transporter'),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.rencana-kirim-cancelled',
            with: [
                'rencanaKirim' => $this->rencanaKirim,
                'items' => $this->rencanaKirim->items,
            ],
        );
    }
}
