<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiayaConfigTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(array $perms = ['biaya_thl.view']): User
    {
        $user = User::create([
            'email' => 'biaya-config-'.uniqid().'@test.com', 'password' => 'password', 'full_name' => 'Biaya Config User',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'level' => 'staff_logistic', 'status' => 'active',
        ]);
        $role = Role::firstOrCreate(['slug' => 'biaya_config_role'], ['name' => 'Biaya Config']);
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug]);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $role->users()->syncWithoutDetaching([$user->id]);

        return $user->fresh();
    }

    public function test_show_requires_authentication(): void
    {
        $this->getJson('/api/v1/biaya-config')->assertUnauthorized();
    }

    public function test_show_requires_biaya_permission(): void
    {
        Sanctum::actingAs($this->makeUser([]));

        $this->getJson('/api/v1/biaya-config')->assertForbidden();
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
