<?php

namespace Tests\Feature;

use App\Models\Dock;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DockControllerTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(array $permSlugs): User
    {
        $role = Role::firstOrCreate(['slug' => 'dock_test'], ['name' => 'Dock Test']);
        foreach ($permSlugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => 'dock-'.uniqid().'@test.com', 'password' => 'password', 'full_name' => 'Dock User',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'staff_logistic', 'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_index_scoped_to_own_depot(): void
    {
        Sanctum::actingAs($this->userWith(['receiving.view', 'receiving.edit']));
        Dock::create(['name' => 'Dock A1', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'status' => 'AVAILABLE']);
        Dock::create(['name' => 'Dock B1', 'kode_depo' => 'DPT-B', 'nama_depo' => 'Depo B', 'status' => 'AVAILABLE']);

        $res = $this->getJson('/api/v1/docks')->assertOk();

        $this->assertSame(['Dock A1'], collect($res->json('data'))->pluck('name')->all());
    }

    public function test_store_forces_own_depot_and_defaults_available(): void
    {
        Sanctum::actingAs($this->userWith(['receiving.edit']));

        $res = $this->postJson('/api/v1/docks', ['name' => 'Dock Baru', 'kode_depo' => 'DPT-B'])
            ->assertCreated();

        $res->assertJsonPath('data.status', 'AVAILABLE');
        $this->assertDatabaseHas('docks', ['name' => 'Dock Baru', 'kode_depo' => 'DPT-A']);
    }

    public function test_store_rejects_duplicate_name(): void
    {
        Sanctum::actingAs($this->userWith(['receiving.edit']));
        Dock::create(['name' => 'Dock A1', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'status' => 'AVAILABLE']);

        $this->postJson('/api/v1/docks', ['name' => 'Dock A1'])->assertJsonValidationErrors(['name']);
    }

    public function test_show_other_depot_returns_403(): void
    {
        Sanctum::actingAs($this->userWith(['receiving.view', 'receiving.edit']));
        $dock = Dock::create(['name' => 'Dock B1', 'kode_depo' => 'DPT-B', 'nama_depo' => 'Depo B', 'status' => 'AVAILABLE']);

        $this->getJson("/api/v1/docks/{$dock->id}")->assertForbidden();
        $this->putJson("/api/v1/docks/{$dock->id}", ['name' => 'Ubah'])->assertForbidden();
        $this->deleteJson("/api/v1/docks/{$dock->id}")->assertForbidden();
        $this->assertModelExists($dock);
    }

    public function test_update_and_delete_own_depot(): void
    {
        Sanctum::actingAs($this->userWith(['receiving.view', 'receiving.edit']));
        $dock = Dock::create(['name' => 'Dock A1', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'status' => 'AVAILABLE']);

        $this->putJson("/api/v1/docks/{$dock->id}", ['name' => 'Dock A1', 'status' => 'OCCUPIED'])
            ->assertOk()->assertJsonPath('data.status', 'OCCUPIED');

        $this->putJson("/api/v1/docks/{$dock->id}", ['name' => 'Dock A1', 'status' => 'RUSAK'])
            ->assertJsonValidationErrors(['status']);

        $this->deleteJson("/api/v1/docks/{$dock->id}")->assertOk();
        $this->assertModelMissing($dock);
    }
}
