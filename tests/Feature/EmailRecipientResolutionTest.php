<?php

namespace Tests\Feature;

use App\Models\EmailRecipient;
use App\Models\Role;
use App\Models\User;
use App\Services\EmailNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Audit resolusi penerima email (lapisan yang menentukan siapa benar-benar
 * menerima): prioritas depo vs global, fallback, penyaringan role/user aktif,
 * flag nonaktif, pemisahan TO/CC, dan dedup alamat.
 */
class EmailRecipientResolutionTest extends TestCase
{
    use RefreshDatabase;

    private function service(): EmailNotificationService
    {
        return app(EmailNotificationService::class);
    }

    /** @param array<string, mixed> $overrides */
    private function recipient(array $overrides = []): EmailRecipient
    {
        return EmailRecipient::create(array_merge([
            'document_type' => 'rencana_kirim',
            'trigger' => 'created',
            'kode_depo' => null,
            'recipient_type' => 'email',
            'field' => 'TO',
            'email' => 'global-to@example.com',
            'is_active' => true,
        ], $overrides));
    }

    private function user(string $email, string $depo, string $status, ?Role $role = null): User
    {
        $user = User::create([
            'email' => $email,
            'password' => 'password',
            'full_name' => $email,
            'kode_depo' => $depo,
            'nama_depo' => 'Depo '.$depo,
            'level' => 'staff_logistic',
            'status' => $status,
        ]);

        if ($role) {
            $role->users()->attach($user->id);
        }

        return $user;
    }

    public function test_depot_recipient_wins_over_global_without_duplicate_send(): void
    {
        $this->recipient(['kode_depo' => null, 'email' => 'global@example.com']);
        $this->recipient(['kode_depo' => 'DPO', 'email' => 'depo@example.com']);

        $resolved = $this->service()->resolveRecipients('rencana_kirim', 'created', 'TO', 'DPO');

        $this->assertSame(['depo@example.com'], $resolved);
    }

    public function test_falls_back_to_global_when_depot_has_no_recipient(): void
    {
        $this->recipient(['kode_depo' => null, 'email' => 'global@example.com']);

        $this->assertSame(
            ['global@example.com'],
            $this->service()->resolveRecipients('rencana_kirim', 'created', 'TO', 'DPO'),
        );
    }

    public function test_role_recipient_resolves_only_active_users_in_that_depot(): void
    {
        $role = Role::create(['slug' => 'rk_penerima', 'name' => 'RK Penerima']);
        $this->recipient([
            'kode_depo' => 'DPO',
            'recipient_type' => 'role',
            'role_slug' => 'rk_penerima',
            'email' => null,
        ]);

        $activeInDepot = $this->user('depo-active@example.com', 'DPO', 'active', $role);
        $this->user('other-depo@example.com', 'DPB', 'active', $role);
        $this->user('depo-inactive@example.com', 'DPO', 'inactive', $role);
        $this->user('depo-no-role@example.com', 'DPO', 'active');

        $this->assertSame(
            [$activeInDepot->email],
            $this->service()->resolveRecipients('rencana_kirim', 'created', 'TO', 'DPO'),
        );
    }

    public function test_inactive_recipient_is_never_resolved(): void
    {
        $this->recipient(['kode_depo' => 'DPO', 'is_active' => false, 'email' => 'off@example.com']);

        $this->assertSame(
            [],
            $this->service()->resolveRecipients('rencana_kirim', 'created', 'TO', 'DPO'),
        );
    }

    public function test_user_recipient_pointing_to_inactive_user_is_not_resolved(): void
    {
        $inactive = $this->user('inactive-target@example.com', 'DPO', 'inactive');
        $this->recipient([
            'kode_depo' => 'DPO',
            'recipient_type' => 'user',
            'user_id' => $inactive->id,
            'email' => null,
        ]);

        $this->assertSame(
            [],
            $this->service()->resolveRecipients('rencana_kirim', 'created', 'TO', 'DPO'),
        );
    }

    public function test_to_and_cc_resolve_independently(): void
    {
        $this->recipient(['field' => 'TO', 'kode_depo' => 'DPO', 'email' => 'to-depo@example.com']);
        $this->recipient(['field' => 'CC', 'kode_depo' => null, 'email' => 'cc-global@example.com']);

        $service = $this->service();
        $this->assertSame(['to-depo@example.com'], $service->resolveRecipients('rencana_kirim', 'created', 'TO', 'DPO'));
        $this->assertSame(['cc-global@example.com'], $service->resolveRecipients('rencana_kirim', 'created', 'CC', 'DPO'));
    }

    public function test_duplicate_emails_are_deduplicated(): void
    {
        $this->recipient(['kode_depo' => 'DPO', 'email' => 'dup@example.com', 'field' => 'TO']);
        $this->recipient(['kode_depo' => 'DPO', 'email' => 'dup@example.com', 'field' => 'TO']);

        $this->assertSame(
            ['dup@example.com'],
            $this->service()->resolveRecipients('rencana_kirim', 'created', 'TO', 'DPO'),
        );
    }
}
