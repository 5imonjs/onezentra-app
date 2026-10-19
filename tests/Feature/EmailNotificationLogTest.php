<?php

namespace Tests\Feature;

use App\Models\EmailDepotSetting;
use App\Models\EmailNotificationLog;
use App\Models\EmailRecipient;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\EmailNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Mailable;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Kegagalan/skip notifikasi tercatat di DB dan terlihat di Setting Email
 * (tidak hanya log file yang sunyi bagi admin).
 */
class EmailNotificationLogTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $role = Role::firstOrCreate(['slug' => 'email_log_admin'], ['name' => 'Email Log Admin']);
        $perm = Permission::firstOrCreate(['slug' => 'emails.view'], ['name' => 'emails.view']);
        $role->permissions()->syncWithoutDetaching([$perm->id]);

        $user = User::create([
            'email' => 'emaillog@test.com',
            'password' => 'password',
            'full_name' => 'Email Log',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_skipped_notification_is_logged_and_listed(): void
    {
        $service = app(EmailNotificationService::class);
        $context = new class
        {
            public int $id = 999;

            public function getKey(): int
            {
                return $this->id;
            }
        };

        // Tanpa penerima terkonfigurasi -> skip tercatat.
        $service->send('biaya_thl', 'submitted', $context, new \stdClass);

        $this->assertDatabaseHas('email_notification_logs', [
            'document_type' => 'biaya_thl',
            'trigger' => 'submitted',
            'status' => 'skipped',
        ]);

        Sanctum::actingAs($this->admin());
        $res = $this->getJson('/api/v1/email-settings/notification-logs')->assertOk();

        $this->assertSame('skipped', $res->json('data.data.0.status'));
    }

    public function test_failed_log_can_be_filtered_by_status(): void
    {
        EmailNotificationLog::create([
            'document_type' => 'receiving', 'trigger' => 'completed',
            'context_id' => 1, 'status' => 'failed', 'error' => 'SMTP down',
        ]);
        EmailNotificationLog::create([
            'document_type' => 'receiving', 'trigger' => 'completed',
            'context_id' => 2, 'status' => 'skipped',
        ]);

        Sanctum::actingAs($this->admin());
        $res = $this->getJson('/api/v1/email-settings/notification-logs?status=failed')->assertOk();

        $this->assertSame(1, $res->json('data.total'));
        $this->assertSame('failed', $res->json('data.data.0.status'));
        $this->assertSame('SMTP down', $res->json('data.data.0.error'));
    }

    private function context(int $id = 77): object
    {
        return new class($id)
        {
            public function __construct(public int $id) {}

            public function getKey(): int
            {
                return $this->id;
            }
        };
    }

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

    public function test_successful_send_is_logged_for_audit(): void
    {
        Mail::fake();
        EmailRecipient::create([
            'document_type' => 'biaya_thl', 'trigger' => 'submitted',
            'recipient_type' => 'email', 'field' => 'TO',
            'email' => 'penerima@test.com', 'is_active' => true,
        ]);

        app(EmailNotificationService::class)->send('biaya_thl', 'submitted', $this->context(), $this->mailable());

        $this->assertDatabaseHas('email_notification_logs', [
            'document_type' => 'biaya_thl',
            'trigger' => 'submitted',
            'context_id' => 77,
            'status' => 'sent',
            'recipients' => 'penerima@test.com',
        ]);
    }

    public function test_disabled_depot_skips_with_explicit_reason(): void
    {
        // Depo dinonaktifkan → tidak kirim walau Global terisi, dan alasannya
        // terlihat di notification-logs (bukan "tidak ada penerima").
        EmailDepotSetting::create(['kode_depo' => '0127', 'is_enabled' => false]);
        EmailRecipient::create([
            'document_type' => 'biaya_thl', 'trigger' => 'submitted',
            'recipient_type' => 'email', 'field' => 'TO',
            'email' => 'global@test.com', 'kode_depo' => null, 'is_active' => true,
        ]);

        app(EmailNotificationService::class)->send('biaya_thl', 'submitted', $this->context(88), new \stdClass, '0127');

        $this->assertDatabaseHas('email_notification_logs', [
            'document_type' => 'biaya_thl',
            'trigger' => 'submitted',
            'context_id' => 88,
            'status' => 'skipped',
            'error' => 'Email dinonaktifkan untuk depo 0127.',
        ]);
    }
}
