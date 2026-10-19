<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_logout_with_session_auth_does_not_error(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        // actingAs pada test melekatkan user ke guard selama test berjalan,
        // jadi yang dibuktikan di sini: logout sesi tidak melempar 500
        // (regresi TransientToken::delete()) dan membersihkan token yatim.
        $this->postJson('/api/v1/logout')
            ->assertOk()
            ->assertJsonPath('message', 'Logged out successfully');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_login_does_not_issue_bearer_token(): void
    {
        User::factory()->create([
            'email' => 'auth-audit@example.com',
            'password' => 'secret-123',
        ]);

        $response = $this->postJson('/api/v1/login', [
            'email' => 'auth-audit@example.com',
            'password' => 'secret-123',
        ]);

        $response->assertOk();
        $response->assertJsonMissingPath('token');
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_login_inactive_account_is_indistinguishable_from_wrong_password(): void
    {
        User::factory()->create([
            'email' => 'enum-active@example.com',
            'password' => 'secret-123',
            'status' => 'active',
        ]);
        User::factory()->create([
            'email' => 'enum-inactive@example.com',
            'password' => 'secret-123',
            'status' => 'inactive',
        ]);

        $wrongPassword = $this->postJson('/api/v1/login', [
            'email' => 'enum-active@example.com',
            'password' => 'salah',
        ]);
        $inactive = $this->postJson('/api/v1/login', [
            'email' => 'enum-inactive@example.com',
            'password' => 'secret-123',
        ]);

        // Pesan harus identik: status akun tidak boleh bisa di-enumerasi dari
        // respons login (akun nonaktif = kredensial salah).
        $wrongPassword->assertStatus(422);
        $inactive->assertStatus(422);
        $this->assertSame($wrongPassword->json('errors.email'), $inactive->json('errors.email'));
    }
}
