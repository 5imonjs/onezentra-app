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

    private function resolveStandarisasi(): StandarisasiTumpukan
    {
        $standarisasi = $this->standarisasi;
        if (! $standarisasi->exists && method_exists($standarisasi, 'getKey') && $standarisasi->getKey()) {
            $reloaded = StandarisasiTumpukan::with('npn')->find($standarisasi->getKey());
            if ($reloaded) {
                $this->standarisasi = $reloaded;
                $standarisasi = $reloaded;
            }
        }
        return $standarisasi;
    }

    public function envelope(): Envelope
    {
        $standarisasi = $this->resolveStandarisasi();

        $action = match ($standarisasi->status) {
            'approved' => 'Disetujui',
            'rejected' => 'Ditolak',
            default => 'Diajukan',
        };
        $product = $standarisasi->npn?->szNickName ?? $standarisasi->npn?->BOSnetszProductId ?? 'Produk';

        return new Envelope(
            subject: 'Standarisasi Tumpukan '.$action.' - '.$product,
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.standarisasi-status',
            with: [
                'standarisasi' => $this->resolveStandarisasi(),
            ],
        );
    }
}
