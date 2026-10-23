<?php

namespace Tests\Feature;

use App\Models\DepotSetting;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PermissionHierarchyTest extends TestCase
{
    use RefreshDatabase;

    private int $userSeq = 0;

    private function makeUser(string $level, string $kodeDepo, ?string $regionId = null): User
    {
        $role = Role::firstOrCreate(['slug' => 'role_'.$level.'_'.$kodeDepo], [
            'name' => $level.' '.$kodeDepo,
        ]);

        $user = User::create([
            'email' => strtolower($level).'-'.strtolower($kodeDepo).'-'.(++$this->userSeq).'@hierarchy.test',
            'password' => 'password',
            'full_name' => 'User '.$kodeDepo,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'region_id' => $regionId,
            'level' => $level,
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);
        User::clearPermissionCache($user->id);

        return $user;
    }

    private function grant(User $user, string $slug): Permission
    {
        $perm = Permission::firstOrCreate(['slug' => $slug], [
            'name' => ucfirst($slug),
            'menu_group' => 'Test',
            'is_active' => true,
        ]);
        $user->roles()->firstOrFail()->permissions()->syncWithoutDetaching([$perm->id]);
        User::clearPermissionCache($user->id);

        return $perm;
    }

    private function makeDepot(string $kodeDepo, string $regionId): void
    {
        DepotSetting::updateOrCreate(
            ['kode_depo' => $kodeDepo],
            ['nama_depo' => 'Depo '.$kodeDepo, 'region_id' => $regionId, 'is_active' => true]
        );
    }

    public function test_permission_index_exposes_region_as_branch_of_view_all(): void
    {
        $viewAll = Permission::create([
            'name' => 'Akses Semua Depo',
            'slug' => 'depot.view_all',
            'menu_group' => 'Umum',
            'sort_order' => 20,
            'is_active' => true,
        ]);
        Permission::create([
            'name' => 'Akses Depo Region',
            'slug' => 'depot.view_region',
            'menu_group' => 'Umum',
            'sort_order' => 21,
            'parent_id' => $viewAll->id,
            'is_active' => true,
        ]);

        $admin = $this->makeUser('admin_master', 'ADMIN');
        $this->grant($admin, 'roles.view');
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/permissions')->assertOk();

        $region = collect($response->json('data'))->firstWhere('slug', 'depot.view_region');
        $this->assertSame($viewAll->id, $region['parent_id']);
        $this->assertSame('depot.view_all', $region['parent']['slug']);
    }

    public function test_admin_master_can_grant_and_revoke_depot_view_all_on_a_role(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R1-B', 'REG-1');
        $this->makeDepot('R2-A', 'REG-2');

        $admin = $this->makeUser('admin_master', 'ADMIN');
        $this->grant($admin, 'roles.edit');

        $planner = $this->makeUser('admin_planner', 'R1-A', 'REG-1');
        $region = $this->grant($planner, 'depot.view_region');
        $viewAll = Permission::firstOrCreate(['slug' => 'depot.view_all'], [
            'name' => 'Akses Semua Depo',
            'menu_group' => 'Umum',
            'is_active' => true,
        ]);

        $role = $planner->roles()->firstOrFail();

        // Permission region does not expand the user's explicitly assigned depot.
        $this->assertSame(['R1-A'], $planner->fresh()->depot_codes);

        // Admin master memberi view_all lewat API (bukan dikunci di kode).
        Sanctum::actingAs($admin);
        $this->putJson("/api/v1/roles/{$role->id}/permissions", [
            'permission_ids' => [$region->id, $viewAll->id],
        ])->assertOk();

        // view_all menang: user menjadi global, tidak dibatasi region.
        $this->assertSame([], $planner->fresh()->depot_codes);

        // Dicabut kembali: user tetap hanya melihat depot yang ditetapkan.
        $this->putJson("/api/v1/roles/{$role->id}/permissions", [
            'permission_ids' => [$region->id],
        ])->assertOk();

        $this->assertSame(['R1-A'], $planner->fresh()->depot_codes);
    }

    public function test_permission_parent_cannot_be_itself_or_a_descendant(): void
    {
        $admin = $this->makeUser('admin_master', 'ADMIN');
        $this->grant($admin, 'roles.edit');

        $parent = Permission::create([
            'name' => 'Parent',
            'slug' => 'test.parent',
            'menu_group' => 'Test',
            'is_active' => true,
        ]);
        $child = Permission::create([
            'name' => 'Child',
            'slug' => 'test.child',
            'menu_group' => 'Test',
            'parent_id' => $parent->id,
            'is_active' => true,
        ]);

        Sanctum::actingAs($admin);

        $this->putJson("/api/v1/permissions/{$parent->id}", [
            'parent_id' => $parent->id,
        ])->assertStatus(422);

        $this->putJson("/api/v1/permissions/{$parent->id}", [
            'parent_id' => $child->id,
        ])->assertStatus(422);
    }

    public function test_users_index_reports_region_permission_and_filters_by_region(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R2-A', 'REG-2');

        $admin = $this->makeUser('admin_master', 'ADMIN');
        $this->grant($admin, 'users.view');
        $this->grant($admin, 'depot.view_all');

        $scoped = $this->makeUser('admin_planner', 'R1-A', 'REG-1');
        $this->grant($scoped, 'depot.view_region');

        // Region terisi tanpa permission konteks region.
        $inactive = $this->makeUser('cheker', 'R1-A', 'REG-1');

        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/users?per_page=50')->assertOk();
        $rows = collect($response->json('data'))->keyBy('id');

        $this->assertTrue($rows[$scoped->id]['has_region_permission']);
        $this->assertFalse($rows[$inactive->id]['has_region_permission']);

        $filtered = $this->getJson('/api/v1/users?region_id=REG-2&per_page=50')->assertOk();
        $this->assertCount(0, $filtered->json('data'));
    }
}
