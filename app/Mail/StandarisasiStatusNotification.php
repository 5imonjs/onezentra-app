<?php

namespace App\Mail;

use App\Models\StandarisasiTumpukan;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class StandarisasiStatusNotification extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public StandarisasiTumpukan $standarisasi) {}

    public function envelope(): Envelope
    {
        $action = match ($this->standarisasi->status) {
            'approved' => 'Disetujui',
            'rejected' => 'Ditolak',
            default => 'Diajukan',
        };
        $product = $this->standarisasi->npn?->szNickName ?? $this->standarisasi->npn?->BOSnetszProductId ?? 'Produk';

        return new Envelope(
            subject: 'Standarisasi Tumpukan '.$action.' - '.$product,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.standarisasi-status',
            with: [
                'standarisasi' => $this->standarisasi,
            ],
        );
    }
}
