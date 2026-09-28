<?php

namespace Tests\Feature;

use App\Models\EmailSetting;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
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
}
