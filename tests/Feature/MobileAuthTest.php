<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MobileAuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_mobile_login_issues_bearer_token(): void
    {
        User::factory()->create([
            'email' => 'mobile@onezentra.com',
            'password' => 'secret-123',
            'status' => 'active',
        ]);

        $response = $this->postJson('/api/v1/mobile/login', [
            'email' => 'mobile@onezentra.com',
            'password' => 'secret-123',
            'device_name' => 'pixel-8',
        ]);

        $response->assertOk()
            ->assertJsonPath('message', 'Login successful')
            ->assertJsonPath('token_type', 'Bearer')
            ->assertJsonPath('user.email', 'mobile@onezentra.com');

        $this->assertNotEmpty($response->json('token'));
        $this->assertNotEmpty($response->json('expires_at'));
        $this->assertDatabaseHas('personal_access_tokens', ['name' => 'pixel-8']);
    }

    public function test_mobile_login_rejects_wrong_password_and_inactive(): void
    {
        User::factory()->create([
            'email' => 'mobile-blok@onezentra.com',
            'password' => 'secret-123',
            'status' => 'active',
        ]);
        User::factory()->create([
            'email' => 'mobile-inactive@onezentra.com',
            'password' => 'secret-123',
            'status' => 'inactive',
        ]);

        $this->postJson('/api/v1/mobile/login', [
            'email' => 'mobile-blok@onezentra.com',
            'password' => 'salah',
        ])->assertStatus(422);

        $this->postJson('/api/v1/mobile/login', [
            'email' => 'mobile-inactive@onezentra.com',
            'password' => 'secret-123',
        ])->assertStatus(422);

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_mobile_token_can_access_user_and_logout_revokes_only_current_token(): void
    {
        $user = User::factory()->create(['status' => 'active']);

        $tokenA = $user->createToken('device-a', ['*'], now()->addHour())->plainTextToken;
        $tokenB = $user->createToken('device-b', ['*'], now()->addHour())->plainTextToken;

        // Kedua token berlaku.
        $this->getJson('/api/v1/user', ['Authorization' => "Bearer {$tokenA}"])->assertOk();
        $this->getJson('/api/v1/user', ['Authorization' => "Bearer {$tokenB}"])->assertOk();

        // Logout dari device-a: hanya token itu yang dicabut.
        $this->postJson('/api/v1/mobile/logout', [], ['Authorization' => "Bearer {$tokenA}"])
            ->assertOk()
            ->assertJsonPath('message', 'Logged out successfully');

        $this->assertDatabaseMissing('personal_access_tokens', ['name' => 'device-a']);
        $this->assertDatabaseHas('personal_access_tokens', ['name' => 'device-b']);

        // Auth::forgetGuards(): guard Sanctum di-resolve sekali per instance
        // aplikasi dan meng-cache user antar panggilan HTTP dalam satu test.
        // Tanpa ini, request pasca-logout masih melihat user lama (artefak
        // test) — request HTTP asli selalu boot fresh dan terkena 401.
        Auth::forgetGuards();

        // Urutan penting: cek token yang dicabut DULU. Kedua token milik
        // user yang sama, jadi request token-b akan meng-cache user di guard
        // dan membuat cek token-a sesudahnya keliru 200 (artefak test lagi).
        $this->getJson('/api/v1/user', ['Authorization' => "Bearer {$tokenA}"])->assertUnauthorized();
        $this->getJson('/api/v1/user', ['Authorization' => "Bearer {$tokenB}"])->assertOk();
    }

    public function test_web_logout_does_not_revoke_mobile_token(): void
    {
        $user = User::factory()->create(['status' => 'active']);
        $mobileToken = $user->createToken('device-mobile', ['*'], now()->addHour())->plainTextToken;

        // Logout via sesi web (cookie) tidak boleh mencabut token mobile.
        Sanctum::actingAs($user);
        $this->postJson('/api/v1/logout')->assertOk();
        $this->assertDatabaseHas('personal_access_tokens', ['name' => 'device-mobile']);

        $this->getJson('/api/v1/user', ['Authorization' => "Bearer {$mobileToken}"])->assertOk();
    }

    public function test_web_login_still_cookie_only_without_token(): void
    {
        User::factory()->create([
            'email' => 'web@onezentra.com',
            'password' => 'secret-123',
            'status' => 'active',
        ]);

        $this->postJson('/api/v1/login', [
            'email' => 'web@onezentra.com',
            'password' => 'secret-123',
        ])->assertOk()->assertJsonMissingPath('token');

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_mobile_login_ignores_csrf_from_stateful_browser_origin(): void
    {
        // Flutter Web mengirim Origin sehingga Sanctum menganggapnya stateful.
        // Endpoint Bearer mobile dikecualikan dari CSRF via
        // App\Http\Middleware\VerifyCsrfToken::$except. Catatan: framework
        // me-bypass CSRF saat unit test (runningUnitTests), jadi tes ini
        // mengunci perilaku ujung-ke-ujung (status + token + header browser),
        // bukan gerbang CSRF-nya — gerbangnya diverifikasi manual via curl
        // (mobile 200, web tanpa sesi tetap 419).
        User::factory()->create([
            'email' => 'mobile-web@onezentra.com',
            'password' => 'secret-123',
            'status' => 'active',
        ]);

        $this->postJson('/api/v1/mobile/login', [
            'email' => 'mobile-web@onezentra.com',
            'password' => 'secret-123',
        ], [
            'Origin' => 'http://localhost:3000',
            'Referer' => 'http://localhost:3000/#/login',
        ])->assertOk()->assertJsonPath('token_type', 'Bearer');
    }
}
