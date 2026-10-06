<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OpnameExpiredNotification extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $kind,
        public string $weekStart,
        public array $rows,
    ) {}

    public function envelope(): Envelope
    {
        $subject = $this->kind === 'reminder'
            ? '[Pengingat] Opname Expired minggu '.$this->weekStart.' belum dikirim'
            : '[Opname Expired] Sesi minggu '.$this->weekStart.' selesai';

        return new Envelope(subject: $subject);
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.opname-expired-notification',
            with: [
                'kind' => $this->kind,
                'weekStart' => $this->weekStart,
                'rows' => $this->rows,
            ],
        );
    }
}
