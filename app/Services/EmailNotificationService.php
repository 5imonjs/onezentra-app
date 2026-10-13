<?php

namespace App\Services;

use App\Models\EmailNotificationLog;
use App\Models\EmailRecipient;
use App\Models\EmailSetting;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class EmailNotificationService
{
    /**
     * Apply SMTP settings from email_settings to the runtime mail config.
     * Falls back to .env values when from_system_env is true or no setting exists.
     */
    public function applySmtpSettings(): void
    {
        $setting = EmailSetting::latest('id')->first();
        if (! $setting || ! $setting->is_active) {
            return; // use .env defaults
        }

        if ($setting->mailer) {
            Config::set('mail.default', in_array($setting->mailer, ['smtp', 'log']) ? $setting->mailer : 'smtp');
        }

        if (! $setting->from_system_env) {
            Config::set('mail.mailers.smtp.host', $setting->host);
            Config::set('mail.mailers.smtp.port', $setting->port);
            Config::set('mail.mailers.smtp.username', $setting->username);
            Config::set('mail.mailers.smtp.password', $setting->password);
            Config::set('mail.mailers.smtp.encryption', $setting->encryption);
        }

        if ($setting->from_address) {
            Config::set('mail.from.address', $setting->from_address);
            Config::set('mail.from.name', $setting->from_name);
        }
    }

    /**
     * Resolve recipient emails for a trigger (document_type + trigger + field).
     *
     * Priority:
     * 1. Depot-specific recipients (kode_depo matches)
     * 2. Global default recipients (kode_depo = null)
     *
     * @return string[]
     */
    public function resolveRecipients(string $documentType, string $trigger, string $field, ?string $kodeDepo = null): array
    {
        // 1. Try depot-specific recipients first
        if ($kodeDepo) {
            $emails = $this->resolveByDepot($documentType, $trigger, $field, $kodeDepo);
            if (! empty($emails)) {
                return array_values(array_unique(array_filter($emails)));
            }
        }

        // 2. Fallback to global default (kode_depo = null)
        return $this->resolveByDepot($documentType, $trigger, $field, null);
    }

    /**
     * Resolve recipients by specific depot (or global if kodeDepo is null).
     */
    private function resolveByDepot(string $documentType, string $trigger, string $field, ?string $kodeDepo): array
    {
        $emails = [];

        $query = EmailRecipient::where('document_type', $documentType)
            ->where('trigger', $trigger)
            ->where('field', $field)
            ->where('is_active', true);

        if ($kodeDepo) {
            $query->where('kode_depo', $kodeDepo);
        } else {
            $query->whereNull('kode_depo');
        }

        $recipients = $query->get();

        foreach ($recipients as $recipient) {
            if ($recipient->recipient_type === 'role') {
                foreach ($recipient->resolveRoleEmailsByDepot($kodeDepo) as $email) {
                    $emails[] = $email;
                }
            } else {
                $email = $recipient->resolveEmail();
                if ($email) {
                    $emails[] = $email;
                }
            }
        }

        return array_values(array_unique(array_filter($emails)));
    }

    /**
     * Send a mailable to recipients (TO + CC) for a given trigger without failing the request.
     * Menggunakan queue agar tidak blok API (fix P-5).
     */
    public function send(
        string $documentType,
        string $trigger,
        object $context,
        object $mailable,
        ?string $kodeDepo = null
    ): void {
        try {
            $this->applySmtpSettings();

            $to = $this->resolveRecipients($documentType, $trigger, 'TO', $kodeDepo);
            $cc = $this->resolveRecipients($documentType, $trigger, 'CC', $kodeDepo);

            if (empty($to) && empty($cc)) {
                Log::warning('Email notification skipped: no recipients configured.', [
                    'document_type' => $documentType,
                    'trigger' => $trigger,
                    'context_id' => method_exists($context, 'getKey') ? $context->getKey() : ($context->id ?? null),
                ]);
                EmailNotificationLog::create([
                    'document_type' => $documentType,
                    'trigger' => $trigger,
                    'context_id' => method_exists($context, 'getKey') ? $context->getKey() : ($context->id ?? null),
                    'status' => EmailNotificationLog::STATUS_SKIPPED,
                    'error' => 'Tidak ada penerima terkonfigurasi.',
                ]);

                return;
            }

            $mailable->to($to);
            if (! empty($cc)) {
                $mailable->cc($cc);
            }

            // Queue jika mailer mendukung queue, fallback ke send sync (testing/log)
            if (method_exists($mailable, 'queue') && config('queue.default') !== 'sync' && app()->environment('production')) {
                Mail::queue($mailable);
            } else {
                // afterResponse agar tidak tambah latency walau sync driver; testing mengirim sync agar assertSent berfungsi
                if (function_exists('dispatch') && ! app()->environment('testing')) {
                    // Closure afterResponse jalan DI LUAR try/catch di atas —
                    // bungkus sendiri agar gagal SMTP tercatat FAILED + retry
                    // manual terlihat di notification-logs, bukan hilang diam.
                    $logContext = [
                        'document_type' => $documentType,
                        'trigger' => $trigger,
                        'context_id' => method_exists($context, 'getKey') ? $context->getKey() : ($context->id ?? null),
                        'recipients' => implode(', ', array_merge((array) ($to ?? []), (array) ($cc ?? []))) ?: null,
                    ];
                    dispatch(function () use ($mailable, $logContext): void {
                        try {
                            Mail::send($mailable);
                        } catch (\Throwable $e) {
                            Log::error('Email notification failed (afterResponse): '.$e->getMessage(), $logContext);
                            EmailNotificationLog::create($logContext + [
                                'status' => EmailNotificationLog::STATUS_FAILED,
                                'error' => $e->getMessage(),
                            ]);
                        }
                    })->afterResponse();
                } else {
                    Mail::send($mailable);
                }
            }
        } catch (\Throwable $e) {
            Log::error('Email notification failed: '.$e->getMessage(), [
                'document_type' => $documentType,
                'trigger' => $trigger,
                'context_id' => method_exists($context, 'getKey') ? $context->getKey() : ($context->id ?? null),
            ]);
            EmailNotificationLog::create([
                'document_type' => $documentType,
                'trigger' => $trigger,
                'context_id' => method_exists($context, 'getKey') ? $context->getKey() : ($context->id ?? null),
                'recipients' => implode(', ', array_merge((array) ($to ?? []), (array) ($cc ?? []))) ?: null,
                'status' => EmailNotificationLog::STATUS_FAILED,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
