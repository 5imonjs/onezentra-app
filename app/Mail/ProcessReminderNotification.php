<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class ProcessReminderNotification extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $processLabel,
        public string $documentTitle,
        public string $depot,
        public int $elapsedMinutes,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: '[Pengingat] '.$this->processLabel.' - '.$this->documentTitle,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.process-reminder',
            with: [
                'processLabel' => $this->processLabel,
                'documentTitle' => $this->documentTitle,
                'depot' => $this->depot,
                'elapsedMinutes' => $this->elapsedMinutes,
            ],
        );
    }
}
