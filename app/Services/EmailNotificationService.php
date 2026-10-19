<?php

namespace App\Services;

use App\Models\EmailDepotSetting;
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
     * Apakah kiriman email diizinkan untuk depo ini?
     *
     * Absennya baris `email_depot_settings` berarti aktif (default), sehingga
     * instalasi lama tidak berubah perilaku sampai admin mematikan depo.
     */
    public function isDepotEnabled(?string $kodeDepo): bool
    {
        if (blank($kodeDepo)) {
            return true;
        }

        $setting = EmailDepotSetting::where('kode_depo', $kodeDepo)->first();

        return $setting === null || $setting->is_enabled;
    }

    /**
     * Resolve recipient emails for a trigger (document_type + trigger + field).
     *
     * Priority:
     * 1. Saklar depo: depo yang dinonaktifkan tidak menerima email sama sekali.
     * 2. Depot-specific recipients (kode_depo matches)
     * 3. Global default recipients (kode_depo = null)
     *
     * @return string[]
     */
    public function resolveRecipients(string $documentType, string $trigger, string $field, ?string $kodeDepo = null): array
    {
        if (! $this->isDepotEnabled($kodeDepo)) {
            return [];
        }

        // 1. Try depot-specific recipients first
        if ($kodeDepo) {
            $emails = $this->resolveByDepot($documentType, $trigger, $field, $kodeDepo, $kodeDepo);
            if (! empty($emails)) {
                return array_values(array_unique(array_filter($emails)));
            }
        }

        // 2. Fallback ke Global (kode_depo = null). Baris Global tetap
        //    di-resolve dengan depo dokumen agar anggota role TIDAK bocor
        //    lintas depo (sebelumnya `null` membuat semua depo menerima).
        return $this->resolveByDepot($documentType, $trigger, $field, null, $kodeDepo);
    }

    /**
     * Resolve recipients by specific depot (or global if kodeDepo is null).
     *
     * @param  ?string  $rowDepot  Filter baris konfigurasi (null = Global).
     * @param  ?string  $roleDepot  Depo dokumen untuk scoping anggota role.
     */
    private function resolveByDepot(string $documentType, string $trigger, string $field, ?string $rowDepot, ?string $roleDepot): array
    {
        $emails = [];

        $query = EmailRecipient::where('document_type', $documentType)
            ->where('trigger', $trigger)
            ->where('field', $field)
            ->where('is_active', true);

        if ($rowDepot) {
            $query->where('kode_depo', $rowDepot);
        } else {
            $query->whereNull('kode_depo');
        }

        $recipients = $query->get();

        foreach ($recipients as $recipient) {
            if ($recipient->recipient_type === 'role') {
                foreach ($recipient->resolveRoleEmailsByDepot($roleDepot) as $email) {
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
        $contextId = method_exists($context, 'getKey') ? $context->getKey() : ($context->id ?? null);

        try {
            $this->applySmtpSettings();

            $to = $this->resolveRecipients($documentType, $trigger, 'TO', $kodeDepo);
            $cc = $this->resolveRecipients($documentType, $trigger, 'CC', $kodeDepo);

            if (empty($to) && empty($cc)) {
                $reason = ! $this->isDepotEnabled($kodeDepo)
                    ? "Email dinonaktifkan untuk depo {$kodeDepo}."
                    : 'Tidak ada penerima terkonfigurasi.';

                Log::warning('Email notification skipped: '.$reason, [
                    'document_type' => $documentType,
                    'trigger' => $trigger,
                    'context_id' => $contextId,
                ]);
                EmailNotificationLog::create([
                    'document_type' => $documentType,
                    'trigger' => $trigger,
                    'context_id' => $contextId,
                    'status' => EmailNotificationLog::STATUS_SKIPPED,
                    'error' => $reason,
                ]);

                return;
            }

            $mailable->to($to);
            if (! empty($cc)) {
                $mailable->cc($cc);
            }

            // Konteks log dipakai bersama oleh jalur sukses & gagal agar
            // "email apa terkirim ke siapa" punya jejak audit, bukan hanya
            // skip/gagal yang terlihat.
            $logContext = [
                'document_type' => $documentType,
                'trigger' => $trigger,
                'context_id' => $contextId,
                'recipients' => implode(', ', array_merge($to, $cc)) ?: null,
            ];

            // Queue jika mailer mendukung queue, fallback ke send sync (testing/log)
            if (method_exists($mailable, 'queue') && config('queue.default') !== 'sync' && app()->environment('production')) {
                Mail::queue($mailable);
                EmailNotificationLog::create($logContext + ['status' => EmailNotificationLog::STATUS_SENT]);
            } else {
                // afterResponse agar tidak tambah latency walau sync driver; testing mengirim sync agar assertSent berfungsi
                if (function_exists('dispatch') && ! app()->environment('testing')) {
                    // Closure afterResponse jalan DI LUAR try/catch di atas —
                    // bungkus sendiri agar gagal SMTP tercatat FAILED dan
                    // kiriman sukses terekam SENT, bukan hilang diam.
                    dispatch(function () use ($mailable, $logContext): void {
                        try {
                            Mail::send($mailable);
                            EmailNotificationLog::create($logContext + ['status' => EmailNotificationLog::STATUS_SENT]);
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
                    EmailNotificationLog::create($logContext + ['status' => EmailNotificationLog::STATUS_SENT]);
                }
            }
        } catch (\Throwable $e) {
            Log::error('Email notification failed: '.$e->getMessage(), [
                'document_type' => $documentType,
                'trigger' => $trigger,
                'context_id' => $contextId,
            ]);
            EmailNotificationLog::create([
                'document_type' => $documentType,
                'trigger' => $trigger,
                'context_id' => $contextId,
                'recipients' => implode(', ', array_merge((array) ($to ?? []), (array) ($cc ?? []))) ?: null,
                'status' => EmailNotificationLog::STATUS_FAILED,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
