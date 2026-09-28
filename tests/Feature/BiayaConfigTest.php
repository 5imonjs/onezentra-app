<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiayaConfigTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(): User
    {
        return User::create([
            'email' => 'biaya-config@test.com', 'password' => 'password', 'full_name' => 'Biaya Config User',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'level' => 'staff_logistic', 'status' => 'active',
        ]);
    }

    public function test_show_requires_authentication(): void
    {
        $this->getJson('/api/v1/biaya-config')->assertUnauthorized();
    }

    public function test_show_returns_runtime_thresholds_and_calc_defaults(): void
    {
        Sanctum::actingAs($this->makeUser());

        $res = $this->getJson('/api/v1/biaya-config')->assertOk();

        $res->assertJsonPath('data.thl_rfah_threshold', 750000);
        $res->assertJsonPath('data.retribusi_rfah_threshold', 1000000);
        $res->assertJsonPath('data.retribusi_calc_mode', 'borongan');
        $this->assertArrayHasKey('rfah_name', $res->json('data'));
        $this->assertArrayHasKey('retribusi_rate_zak', $res->json('data'));
        $this->assertArrayHasKey('retribusi_rate_crt', $res->json('data'));
    }
}
