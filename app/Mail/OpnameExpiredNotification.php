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
        return new Envelope(
            subject: match ($this->kind) {
                'reminder' => '[Pengingat] Opname Expired minggu '.$this->weekStart.' belum dikirim',
                'submitted' => '[Opname Expired] Sesi minggu '.$this->weekStart.' menunggu persetujuan',
                'approved' => '[Opname Expired] Sesi minggu '.$this->weekStart.' disetujui — koreksi berlaku',
                'revisi' => '[Opname Expired] Sesi minggu '.$this->weekStart.' perlu revisi',
                'cancelled' => '[Opname Expired] Sesi minggu '.$this->weekStart.' dibatalkan',
                default => '[Opname Expired] Sesi minggu '.$this->weekStart.' selesai',
            }
        );
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
