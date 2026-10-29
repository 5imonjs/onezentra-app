<?php

namespace Tests\Feature;

use App\Jobs\SendEmailNotification;
use App\Mail\StandarisasiStatusNotification;
use App\Models\EmailSetting;
use App\Models\Npn;
use App\Models\StandarisasiTumpukan;
use App\Services\EmailNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Worker antrean tidak mewarisi config SMTP runtime dari request HTTP.
 * Job ini wajib menerapkan ulang setting dari database sebelum mengirim.
 */
class SendEmailNotificationJobTest extends TestCase
{
    use RefreshDatabase;

    private function mailable(): Mailable
    {
        return new class extends Mailable
        {
            public function build(): static
            {
                return $this->subject('Uji')->html('Halo');
            }
        };
    }

    public function test_job_applies_stored_smtp_settings_and_logs_sent(): void
    {
        Mail::fake();

        EmailSetting::create([
            'mailer' => 'smtp',
            'host' => 'stored.smtp.test',
            'port' => 2525,
            'username' => 'u',
            'password' => 'p',
            'encryption' => 'tls',
            'from_system_env' => false,
            'is_active' => true,
        ]);
        config(['mail.mailers.smtp.host' => 'env-host']);

        $job = new SendEmailNotification(
            'standarisasi_tumpukan',
            'submitted',
            77,
            $this->mailable(),
            'blc@test.com',
        );

        $job->handle(app(EmailNotificationService::class));

        $this->assertSame('stored.smtp.test', config('mail.mailers.smtp.host'));
        Mail::assertSentCount(1);
        $this->assertDatabaseHas('email_notification_logs', [
            'document_type' => 'standarisasi_tumpukan',
            'trigger' => 'submitted',
            'context_id' => 77,
            'recipients' => 'blc@test.com',
            'status' => 'sent',
        ]);
    }

    /**
     * Job berjalan di proses worker, jadi mailable + model harus selamat
     * melewati serialisasi antrean.
     */
    public function test_job_survives_queue_serialization_with_model_mailable(): void
    {
        $npn = Npn::create([
            'szNickName' => 'Produk Antrean', 'BOSnetszProductId' => 'B-QUEUE-1',
            'SAPszProductId' => 'SAP-QUEUE-1', 'szStatus' => 'EXISTING',
        ]);
        $standarisasi = StandarisasiTumpukan::create([
            'npn_id' => $npn->id, 'tier' => 2, 'tinggi_tumpukan' => 3,
            'status' => 'pending', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A',
        ])->load('npn');

        $job = new SendEmailNotification(
            'standarisasi_tumpukan',
            'submitted',
            $standarisasi->id,
            new StandarisasiStatusNotification($standarisasi),
            'blc@test.com',
        );

        $restored = unserialize(serialize($job));

        $this->assertInstanceOf(SendEmailNotification::class, $restored);
        $this->assertInstanceOf(StandarisasiStatusNotification::class, $restored->mailable);
        $this->assertSame($standarisasi->id, $restored->mailable->standarisasi->id);
    }

    public function test_job_logs_failed_when_smtp_send_throws(): void
    {
        Mail::shouldReceive('purge')->once();
        Mail::shouldReceive('send')->once()->andThrow(new \RuntimeException('SMTP down'));

        $job = new SendEmailNotification(
            'standarisasi_tumpukan',
            'submitted',
            88,
            $this->mailable(),
            'blc@test.com',
        );

        try {
            $job->handle(app(EmailNotificationService::class));
            $this->fail('Exception SMTP seharusnya diteruskan agar job bisa retry.');
        } catch (\RuntimeException $e) {
            $this->assertSame('SMTP down', $e->getMessage());
        }

        $this->assertDatabaseHas('email_notification_logs', [
            'document_type' => 'standarisasi_tumpukan',
            'trigger' => 'submitted',
            'context_id' => 88,
            'status' => 'failed',
            'error' => 'SMTP down',
        ]);
    }
}
