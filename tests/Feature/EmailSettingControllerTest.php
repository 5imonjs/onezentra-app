<?php

namespace Tests\Feature;

use App\Models\EmailSetting;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\EmailNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class EmailSettingControllerTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(array $permSlugs): User
    {
        $role = Role::firstOrCreate(['slug' => 'email_setting_test'], ['name' => 'Email Setting Test']);
        foreach ($permSlugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => 'mail-'.uniqid().'@test.com', 'password' => 'password', 'full_name' => 'Mail User',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'level' => 'staff_logistic', 'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_show_requires_view_permission(): void
    {
        Sanctum::actingAs($this->userWith([]));

        $this->getJson('/api/v1/email-settings')->assertForbidden();
    }

    public function test_show_returns_defaults_when_empty(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view']));

        $this->getJson('/api/v1/email-settings')->assertOk()->assertJsonPath('data.from_system_env', true);
    }

    public function test_update_hides_password_in_response_but_persists_encrypted(): void
    {
        Sanctum::actingAs($this->userWith(['emails.view', 'emails.edit']));

        $res = $this->putJson('/api/v1/email-settings', [
            'host' => 'smtp.test.com', 'port' => 587, 'username' => 'user', 'password' => 'rahasia-123',
            'from_address' => 'noreply@test.com',
        ])->assertOk();

        $this->assertArrayNotHasKey('password', $res->json('data'));

        $stored = EmailSetting::latest('id')->first()->getAttributes()['password'];
        $this->assertNotSame('rahasia-123', $stored);
        $this->assertSame('rahasia-123', decrypt($stored, false));
    }

    public function test_update_rejects_invalid_from_address(): void
    {
        Sanctum::actingAs($this->userWith(['emails.edit']));

        $this->putJson('/api/v1/email-settings', ['from_address' => 'bukan-email'])
            ->assertJsonValidationErrors(['from_address']);
    }

    public function test_test_endpoint_validates_recipient(): void
    {
        Sanctum::actingAs($this->userWith(['emails.edit']));

        $this->postJson('/api/v1/email-settings/test', ['to' => 'bukan-email'])
            ->assertJsonValidationErrors(['to']);
    }

    public function test_test_endpoint_sends_with_array_mailer(): void
    {
        Sanctum::actingAs($this->userWith(['emails.edit']));

        $this->postJson('/api/v1/email-settings/test', ['to' => 'tujuan@test.com'])->assertOk();
    }

    public function test_apply_smtp_settings_uses_stored_credentials_when_not_from_env(): void
    {
        EmailSetting::create([
            'mailer' => 'smtp', 'host' => 'stored.smtp.test', 'port' => 2525,
            'username' => 'u', 'password' => 'p', 'encryption' => 'tls',
            'from_system_env' => false, 'is_active' => true,
        ]);
        config(['mail.mailers.smtp.host' => 'env-host', 'mail.mailers.smtp.port' => 587]);

        app(EmailNotificationService::class)->applySmtpSettings();

        $this->assertSame('stored.smtp.test', config('mail.mailers.smtp.host'));
        $this->assertSame(2525, config('mail.mailers.smtp.port'));
    }

    public function test_apply_smtp_settings_keeps_env_credentials_when_from_system_env(): void
    {
        EmailSetting::create([
            'mailer' => 'smtp', 'host' => 'stored.smtp.test', 'port' => 2525,
            'from_system_env' => true, 'is_active' => true,
        ]);
        config(['mail.mailers.smtp.host' => 'env-host', 'mail.mailers.smtp.port' => 587]);

        app(EmailNotificationService::class)->applySmtpSettings();

        $this->assertSame('env-host', config('mail.mailers.smtp.host'));
        $this->assertSame(587, config('mail.mailers.smtp.port'));
    }

    public function test_apply_smtp_settings_ignores_inactive_setting(): void
    {
        EmailSetting::create([
            'mailer' => 'smtp', 'host' => 'stored.smtp.test', 'port' => 2525,
            'from_system_env' => false, 'is_active' => false,
        ]);
        config(['mail.mailers.smtp.host' => 'env-host']);

        app(EmailNotificationService::class)->applySmtpSettings();

        $this->assertSame('env-host', config('mail.mailers.smtp.host'));
    }

    public function test_apply_smtp_settings_whitelists_mailer(): void
    {
        EmailSetting::create(['mailer' => 'log', 'from_system_env' => true, 'is_active' => true]);
        app(EmailNotificationService::class)->applySmtpSettings();
        $this->assertSame('log', config('mail.default'));

        // Mailer tak dikenal jatuh aman ke smtp.
        EmailSetting::create(['mailer' => 'garbage', 'from_system_env' => true, 'is_active' => true]);
        app(EmailNotificationService::class)->applySmtpSettings();
        $this->assertSame('smtp', config('mail.default'));
    }

    public function test_update_blank_password_keeps_stored_password(): void
    {
        Sanctum::actingAs($this->userWith(['emails.edit']));
        EmailSetting::create([
            'mailer' => 'smtp', 'host' => 'old.smtp.test', 'password' => 'rahasia-lama', 'is_active' => true,
        ]);

        $this->putJson('/api/v1/email-settings', ['host' => 'new.smtp.test', 'password' => ''])->assertOk();

        $setting = EmailSetting::latest('id')->first();
        $this->assertSame('new.smtp.test', $setting->host);
        $this->assertSame('rahasia-lama', $setting->password);
    }

    public function test_update_null_encryption_becomes_empty_string(): void
    {
        Sanctum::actingAs($this->userWith(['emails.edit']));

        $this->putJson('/api/v1/email-settings', ['encryption' => null])->assertOk();

        // Null dikirim klien (mis. auth tanpa TLS) harus jadi '' bukan crash,
        // agar koneksi tanpa enkripsi tetap bisa dikonfigurasi.
        $this->assertSame('', EmailSetting::latest('id')->first()->encryption);
    }
}
