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
        // Satu peristiwa logout, bukan dua (middleware melewati rute auth).
        $this->assertDatabaseCount('user_activity_logs', 1);
        $this->assertDatabaseHas('user_activity_logs', [
            'user_id' => $user->id,
            'method' => 'LOGOUT',
            'route' => 'auth.logout',
        ]);
    }

    public function test_login_does_not_issue_bearer_token(): void
    {
        $user = User::factory()->create([
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
        $this->assertDatabaseHas('user_activity_logs', [
            'user_id' => $user->id,
            'method' => 'LOGIN',
            'route' => 'auth.login',
        ]);
    }

    public function test_login_inactive_account_gets_distinct_message_only_after_correct_password(): void
    {
        User::factory()->create([
            'email' => 'inactive-login@example.com',
            'password' => 'secret-123',
            'status' => 'inactive',
        ]);

        // Password BENAR + akun nonaktif -> pesan jelas untuk staf.
        $this->postJson('/api/v1/login', [
            'email' => 'inactive-login@example.com',
            'password' => 'secret-123',
        ])->assertStatus(422)
            ->assertJsonPath('errors.email.0', 'Your account is inactive.');

        // Password SALAH -> pesan generik, tidak membocorkan status akun.
        $this->postJson('/api/v1/login', [
            'email' => 'inactive-login@example.com',
            'password' => 'salah',
        ])->assertStatus(422)
            ->assertJsonPath('errors.email.0', 'The provided credentials are incorrect.');
    }
}
