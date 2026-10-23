<?php

namespace Tests\Feature;

use App\Models\DepotSetting;
use App\Models\Permission;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserAlamatTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        Region::firstOrCreate(['code' => 'REG-TEST'], ['name' => 'Region Test']);
        DepotSetting::updateOrCreate(
            ['kode_depo' => 'DPO'],
            ['nama_depo' => 'Depo Test', 'region_id' => 'REG-TEST', 'is_active' => true],
        );
        $role = Role::firstOrCreate(['slug' => 'admin'], ['name' => 'Admin Master']);
        Role::firstOrCreate(['slug' => 'blc'], ['name' => 'BLC', 'is_active' => true]);
        foreach (['users.create', 'users.edit', 'users.view', 'depot.view_all'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $admin = User::create([
            'email' => 'admin@onezentra.com',
            'password' => 'password',
            'full_name' => 'Admin Master',
            'kode_depo' => 'ADMIN',
            'nama_depo' => 'Kantor Pusat',
            'scope_level' => 'master',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        $role->users()->attach($admin->id);

        return $admin;
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'scope_level' => 'depot',
            'region_id' => 'REG-TEST',
            'full_name' => 'User Alamat',
            'email' => 'user-alamat-'.uniqid().'@test.com',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
            'level' => 'blc',
        ], $overrides);
    }

    public function test_store_saves_alamat(): void
    {
        Sanctum::actingAs($this->admin());

        $id = $this->postJson('/api/v1/users', $this->payload(['alamat' => 'Jl. Merdeka No. 10, Pontianak']))
            ->assertCreated()
            ->assertJsonPath('data.alamat', 'Jl. Merdeka No. 10, Pontianak')
            ->json('data.id');

        $this->assertDatabaseHas('users', ['id' => $id, 'alamat' => 'Jl. Merdeka No. 10, Pontianak']);
    }

    public function test_store_without_alamat_succeeds(): void
    {
        Sanctum::actingAs($this->admin());

        $id = $this->postJson('/api/v1/users', $this->payload())
            ->assertCreated()
            ->json('data.id');

        $this->assertDatabaseHas('users', ['id' => $id, 'alamat' => null]);
    }

    public function test_update_saves_alamat(): void
    {
        Sanctum::actingAs($this->admin());

        $target = User::create($this->payload(['email' => 'target-'.uniqid().'@test.com']));

        $this->putJson("/api/v1/users/{$target->id}", ['alamat' => 'Jl. Gajah Mada No. 5, Singkawang'])
            ->assertOk()
            ->assertJsonPath('data.alamat', 'Jl. Gajah Mada No. 5, Singkawang');

        $this->assertDatabaseHas('users', ['id' => $target->id, 'alamat' => 'Jl. Gajah Mada No. 5, Singkawang']);

        $this->getJson("/api/v1/users/{$target->id}")
            ->assertOk()
            ->assertJsonPath('data.alamat', 'Jl. Gajah Mada No. 5, Singkawang');
    }

    public function test_alamat_too_long_is_rejected(): void
    {
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/v1/users', $this->payload(['alamat' => str_repeat('a', 2001)]))
            ->assertJsonValidationErrors(['alamat']);
    }
}
