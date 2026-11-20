<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class EtaOverdueNotification extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $documentTitle,
        public string $depot,
        public string $etaDate,
        public int $daysOverdue,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: '[Pengingat] Rencana tiba terlewat - '.$this->documentTitle,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.eta-overdue',
            with: [
                'documentTitle' => $this->documentTitle,
                'depot' => $this->depot,
                'etaDate' => $this->etaDate,
                'daysOverdue' => $this->daysOverdue,
            ],
        );
    }
}
