<?php

namespace Tests\Feature;

use App\Models\EmailDepotSetting;
use App\Models\EmailRecipient;
use App\Models\Permission;
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

    public function test_disabled_depot_sends_nothing_even_with_global_recipients(): void
    {
        // Inti keluhan: depo sengaja dikosongkan tetap menerima karena baris
        // Global. Saklar depo harus mematikan kiriman itu.
        $this->recipient(['kode_depo' => null, 'email' => 'global@example.com']);
        EmailDepotSetting::create(['kode_depo' => 'DPO', 'is_enabled' => false]);

        $service = $this->service();

        $this->assertFalse($service->isDepotEnabled('DPO'));
        $this->assertTrue($service->isDepotEnabled('DPB')); // absen baris = aktif
        $this->assertSame([], $service->resolveRecipients('rencana_kirim', 'created', 'TO', 'DPO'));
    }

    public function test_reenabled_depot_resolves_recipients_again(): void
    {
        $this->recipient(['kode_depo' => 'DPO', 'email' => 'depo@example.com']);
        $setting = EmailDepotSetting::create(['kode_depo' => 'DPO', 'is_enabled' => false]);

        $this->assertSame([], $this->service()->resolveRecipients('rencana_kirim', 'created', 'TO', 'DPO'));

        $setting->update(['is_enabled' => true]);

        $this->assertSame(
            ['depo@example.com'],
            $this->service()->resolveRecipients('rencana_kirim', 'created', 'TO', 'DPO'),
        );
    }

    public function test_global_role_recipient_is_scoped_to_the_document_depot(): void
    {
        // Sebelum ini fallback global me-resolve role TANPA filter depo
        // sehingga user depo lain ikut menerima email dokumen ini.
        $role = Role::create(['slug' => 'rk_global', 'name' => 'RK Global']);
        $this->recipient([
            'kode_depo' => null,
            'recipient_type' => 'role',
            'role_slug' => 'rk_global',
            'email' => null,
        ]);

        $this->user('depo-a@example.com', 'DPO', 'active', $role);
        $this->user('depo-b@example.com', 'DPB', 'active', $role);
        $this->user('depo-c-off@example.com', 'DPO', 'inactive', $role);

        $this->assertSame(
            ['depo-a@example.com'],
            $this->service()->resolveRecipients('rencana_kirim', 'created', 'TO', 'DPO'),
        );
    }

    /**
     * BLC memegang `standarisasi.view_all`, jadi approver ini memang lintas
     * depo. Pengajuan dari depo mana pun harus sampai ke BLC pusat — bukan
     * hanya BLC yang kebetulan punya `kode_depo` sama dengan dokumen.
     */
    public function test_global_role_with_cross_depot_module_permission_reaches_all_depots(): void
    {
        $role = Role::create(['slug' => 'blc_lintas', 'name' => 'BLC Lintas']);
        $permission = Permission::firstOrCreate(
            ['slug' => 'standarisasi.view_all'],
            ['name' => 'Standarisasi Lintas Depo', 'menu_group' => 'Standarisasi Tumpukan'],
        );
        $role->permissions()->attach($permission->id);

        $this->recipient([
            'document_type' => 'standarisasi_tumpukan',
            'trigger' => 'submitted',
            'kode_depo' => null,
            'recipient_type' => 'role',
            'role_slug' => 'blc_lintas',
            'email' => null,
        ]);

        $this->user('blc-pusat@example.com', 'BLC-01', 'active', $role);
        $this->user('blc-depo@example.com', 'DPO', 'active', $role);

        $this->assertEqualsCanonicalizing(
            ['blc-pusat@example.com', 'blc-depo@example.com'],
            $this->service()->resolveRecipients('standarisasi_tumpukan', 'submitted', 'TO', 'DPO'),
        );
    }

    /**
     * Permission lintas depo hanya berlaku untuk modul yang memberikannya.
     * BLC tetap tidak boleh menerima dokumen depo lain di modul yang tidak
     * memberinya akses lintas depo.
     */
    public function test_cross_depot_role_permission_does_not_leak_to_other_documents(): void
    {
        $role = Role::create(['slug' => 'blc_lintas_dok', 'name' => 'BLC Lintas Dok']);
        $permission = Permission::firstOrCreate(
            ['slug' => 'standarisasi.view_all'],
            ['name' => 'Standarisasi Lintas Depo', 'menu_group' => 'Standarisasi Tumpukan'],
        );
        $role->permissions()->attach($permission->id);

        $this->recipient([
            'document_type' => 'rencana_kirim',
            'trigger' => 'created',
            'kode_depo' => null,
            'recipient_type' => 'role',
            'role_slug' => 'blc_lintas_dok',
            'email' => null,
        ]);

        $this->user('blc-pusat-dok@example.com', 'BLC-01', 'active', $role);
        $this->user('blc-depo-dok@example.com', 'DPO', 'active', $role);

        $this->assertSame(
            ['blc-depo-dok@example.com'],
            $this->service()->resolveRecipients('rencana_kirim', 'created', 'TO', 'DPO'),
        );
    }

    public function test_global_role_without_document_depot_reaches_all_depots(): void
    {
        $role = Role::create(['slug' => 'rk_global_all', 'name' => 'RK Global All']);
        $this->recipient([
            'kode_depo' => null,
            'recipient_type' => 'role',
            'role_slug' => 'rk_global_all',
            'email' => null,
        ]);

        $this->user('depo-a@example.com', 'DPO', 'active', $role);
        $this->user('depo-b@example.com', 'DPB', 'active', $role);

        $resolved = $this->service()->resolveRecipients('rencana_kirim', 'created', 'TO', null);

        $this->assertEqualsCanonicalizing(
            ['depo-a@example.com', 'depo-b@example.com'],
            $resolved,
        );
    }
}
