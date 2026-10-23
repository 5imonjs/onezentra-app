<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserIndexMetaTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string $email, array $perms, string $level = 'operator', string $status = 'active', string $kodeDepo = 'DPO', string $namaDepo = 'Depo Test'): User
    {
        $role = Role::firstOrCreate(['slug' => 'um_'.$email], ['name' => 'UM '.$email]);
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => $email,
            'password' => 'password',
            'full_name' => 'UM '.$email,
            'kode_depo' => $kodeDepo,
            'nama_depo' => $namaDepo,
            'scope_level' => $level === 'admin_master' ? 'master' : 'depot',
            'level' => $level,
            'status' => $status,
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_users_index_returns_real_stats_in_meta(): void
    {
        $admin = $this->userWith('admin@example.com', ['users.view'], 'admin_master');
        $this->userWith('u1@example.com', [], 'staff_logistic', 'active');
        $this->userWith('u2@example.com', [], 'staff_logistic', 'active');
        $this->userWith('u3@example.com', [], 'staff_logistic', 'inactive');

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/users');

        $response->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('total', 4)
            ->assertJsonPath('meta.total', 4)
            ->assertJsonPath('meta.active', 3)
            ->assertJsonPath('meta.inactive', 1)
            ->assertJsonPath('meta.admin_master', 1);
    }

    public function test_users_index_meta_respects_depot_scope(): void
    {
        $actor = $this->userWith('actor@example.com', ['users.view'], 'staff_logistic', 'active');
        $this->userWith('local@example.com', [], 'staff_logistic', 'active');
        $this->userWith('away@example.com', [], 'staff_logistic', 'active', 'SGO', 'Depo Singkawang');

        Sanctum::actingAs($actor);

        $response = $this->getJson('/api/v1/users');

        $response->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('meta.active', 2)
            ->assertJsonPath('meta.inactive', 0)
            ->assertJsonPath('meta.admin_master', 0);
    }
}
