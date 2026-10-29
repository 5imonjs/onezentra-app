<?php

namespace App\Jobs;

use App\Models\EmailNotificationLog;
use App\Services\EmailNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Kirim notifikasi email dari worker antrean.
 *
 * Konfigurasi SMTP dari tabel `email_settings` hanya hidup di proses yang
 * memanggil `applySmtpSettings()`. Kalau mailable diantrekan langsung lewat
 * `Mail::queue()`, worker tidak mewarisi config itu dan memakai MAIL_* dari
 * .env — email bisa "sukses" di log tetapi tidak pernah keluar. Job ini
 * menerapkan ulang setting SMTP di proses worker sebelum mengirim.
 */
class SendEmailNotification implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 30;

    public function __construct(
        public string $documentType,
        public string $trigger,
        public int|string|null $contextId,
        public Mailable $mailable,
        public ?string $recipients = null,
    ) {}

    public function handle(EmailNotificationService $emailService): void
    {
        $logContext = [
            'document_type' => $this->documentType,
            'trigger' => $this->trigger,
            'context_id' => $this->contextId,
            'recipients' => $this->recipients,
        ];

        try {
            $emailService->applySmtpSettings();
            // Worker bisa dipakai ulang antar job; buang transport lama agar
            // config SMTP yang baru benar-benar dipakai.
            $mailer = Mail::getFacadeRoot();
            if (method_exists($mailer, 'purge')) {
                $mailer->purge();
            }

            Mail::send($this->mailable);

            EmailNotificationLog::create($logContext + [
                'status' => EmailNotificationLog::STATUS_SENT,
            ]);
        } catch (\Throwable $e) {
            Log::error('Email notification failed (queued): '.$e->getMessage(), $logContext);

            EmailNotificationLog::create($logContext + [
                'status' => EmailNotificationLog::STATUS_FAILED,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }
}
