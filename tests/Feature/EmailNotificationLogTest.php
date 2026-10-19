<?php

namespace Tests\Feature;

use App\Models\EmailNotificationLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\EmailNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
