<?php

namespace App\Mail;

use App\Models\RencanaKirim;
use Illuminate\Bus\Queueable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SelisihQtyNotification extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public RencanaKirim $rencanaKirim,
        public Collection $selisihItems,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: '[Selisih Qty] '.($this->rencanaKirim->po_transporter ?? 'Dokumen'),
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.selisih-qty-notification',
            with: [
                'rencanaKirim' => $this->rencanaKirim,
                'selisihItems' => $this->selisihItems,
                'totalSelisih' => $this->selisihItems->sum('selisih_qty'),
            ],
        );
    }
}
