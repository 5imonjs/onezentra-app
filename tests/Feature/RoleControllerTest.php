<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RoleControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'role_admin'], ['name' => 'Role Admin']);
        foreach (['roles.view', 'roles.edit'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Sistem']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->user = User::create([
            'email' => 'role-admin@test.com',
            'password' => 'password',
            'full_name' => 'Role Admin User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'admin',
            'status' => 'active',
        ]);
        $role->users()->attach($this->user->id);

        Sanctum::actingAs($this->user);
    }

    public function test_role_with_assigned_users_cannot_be_deactivated(): void
    {
        $assigned = Role::firstOrCreate(['slug' => 'assigned'], ['name' => 'Assigned']);
        $assigned->users()->attach($this->user->id);

        $this->putJson('/api/v1/roles/'.$assigned->id, ['is_active' => false])
            ->assertStatus(422);

        $this->assertTrue((bool) $assigned->fresh()->is_active);
    }

    public function test_role_without_users_can_be_deactivated(): void
    {
        $unassigned = Role::firstOrCreate(['slug' => 'unassigned'], ['name' => 'Unassigned']);

        $this->putJson('/api/v1/roles/'.$unassigned->id, ['is_active' => false])
            ->assertOk();

        $this->assertFalse((bool) $unassigned->fresh()->is_active);
    }

    public function test_role_with_assigned_users_can_be_updated_not_deactivated(): void
    {
        $assigned = Role::firstOrCreate(['slug' => 'assigned_edit'], ['name' => 'Assigned Edit']);
        $assigned->users()->attach($this->user->id);

        $this->putJson('/api/v1/roles/'.$assigned->id, ['description' => 'Ubah deskripsi'])
            ->assertOk();

        $this->assertSame('Ubah deskripsi', $assigned->fresh()->description);
    }
}
