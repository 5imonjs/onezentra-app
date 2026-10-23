<?php

namespace Tests\Feature;

use App\Models\DepotSetting;
use App\Models\PartnerSite;
use App\Models\Permission;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HierarchyManagementTest extends TestCase
{
    use RefreshDatabase;

    private int $userSequence = 0;

    /**
     * @param  array<int, string>  $permissions
     */
    private function makeActor(
        string $scope,
        string $region = 'REG-A',
        string $depot = 'DEPOT-A',
        ?string $partnerSiteCode = null,
        string $level = 'staff_logistic',
        array $permissions = ['users.create', 'users.view', 'users.edit', 'users.delete', 'depot_settings.manage'],
    ): User {
        Region::firstOrCreate(['code' => $region], ['name' => $region]);
        DepotSetting::updateOrCreate(
            ['kode_depo' => $depot],
            ['nama_depo' => $depot, 'region_id' => $region, 'is_active' => true],
        );

        if ($partnerSiteCode !== null) {
            PartnerSite::updateOrCreate(
                ['kode_ps' => $partnerSiteCode],
                ['nama_ps' => $partnerSiteCode, 'kode_depo' => $depot, 'is_active' => true],
            );
        }

        $role = Role::create([
            'slug' => 'hierarchy_actor_'.$scope.'_'.(++$this->userSequence),
            'name' => 'Hierarchy Actor',
            'is_active' => true,
        ]);
        foreach ($permissions as $slug) {
            $permission = Permission::firstOrCreate(
                ['slug' => $slug],
                ['name' => $slug, 'menu_group' => 'Test', 'is_active' => true],
            );
            $role->permissions()->attach($permission);
        }

        $user = User::create([
            'email' => 'hierarchy-actor-'.$this->userSequence.'@example.test',
            'password' => 'password123',
            'full_name' => 'Hierarchy Actor',
            'scope_level' => $scope,
            'region_id' => $region,
            'kode_depo' => $depot,
            'nama_depo' => $depot,
            'kode_ps' => $partnerSiteCode,
            'level' => $level,
            'status' => 'active',
        ]);
        $role->users()->attach($user);

        return $user;
    }

    public function test_master_scope_can_create_every_hierarchy_level_without_admin_role(): void
    {
        $master = $this->makeActor('master');
        Sanctum::actingAs($master);

        $this->postJson('/api/v1/regions', [
            'code' => 'REG-B',
            'name' => 'Region B',
        ])->assertCreated();

        $this->postJson('/api/v1/depot-settings', [
            'kode_depo' => 'DEPOT-B',
            'nama_depo' => 'Depo B',
            'region_id' => 'REG-B',
        ])->assertCreated();

        $this->postJson('/api/v1/partner-sites', [
            'kode_ps' => 'PS-B',
            'nama_ps' => 'Partner Site B',
            'kode_depo' => 'DEPOT-B',
        ])->assertCreated();
    }

    public function test_region_scope_can_create_depots_only_in_its_region(): void
    {
        Region::firstOrCreate(['code' => 'REG-B'], ['name' => 'Region B']);
        $region = $this->makeActor('region');
        Sanctum::actingAs($region);

        $this->postJson('/api/v1/depot-settings', [
            'kode_depo' => 'DEPOT-OWN',
            'nama_depo' => 'Depo Sendiri',
            'region_id' => 'REG-A',
        ])->assertCreated();

        $this->postJson('/api/v1/depot-settings', [
            'kode_depo' => 'DEPOT-OTHER',
            'nama_depo' => 'Depo Luar',
            'region_id' => 'REG-B',
        ])->assertForbidden();
    }

    public function test_depot_scope_can_create_partner_sites_only_in_its_depot(): void
    {
        $depot = $this->makeActor('depot');
        DepotSetting::create([
            'kode_depo' => 'DEPOT-B',
            'nama_depo' => 'Depo B',
            'region_id' => 'REG-A',
            'is_active' => true,
        ]);
        Sanctum::actingAs($depot);

        $this->postJson('/api/v1/partner-sites', [
            'kode_ps' => 'PS-OWN',
            'nama_ps' => 'PS Sendiri',
            'kode_depo' => 'DEPOT-A',
        ])->assertCreated();

        $this->postJson('/api/v1/partner-sites', [
            'kode_ps' => 'PS-OTHER',
            'nama_ps' => 'PS Luar',
            'kode_depo' => 'DEPOT-B',
        ])->assertForbidden();
    }

    public function test_ps_scope_cannot_create_region_depot_or_partner_site_entities(): void
    {
        $ps = $this->makeActor('ps', partnerSiteCode: 'PS-A');
        Sanctum::actingAs($ps);

        $this->postJson('/api/v1/regions', [
            'code' => 'REG-B',
            'name' => 'Region B',
        ])->assertForbidden();

        $this->postJson('/api/v1/depot-settings', [
            'kode_depo' => 'DEPOT-B',
            'nama_depo' => 'Depo B',
            'region_id' => 'REG-A',
        ])->assertForbidden();

        $this->postJson('/api/v1/partner-sites', [
            'kode_ps' => 'PS-B',
            'nama_ps' => 'PS B',
            'kode_depo' => 'DEPOT-A',
        ])->assertForbidden();
    }

    public function test_operational_admin_role_does_not_grant_master_hierarchy_scope(): void
    {
        $actor = $this->makeActor('depot', level: 'admin_master');
        Sanctum::actingAs($actor);

        $this->assertFalse($actor->isMasterScope());
        $this->postJson('/api/v1/depot-settings', [
            'kode_depo' => 'DEPOT-OTHER',
            'nama_depo' => 'Depo Luar',
            'region_id' => 'REG-A',
        ])->assertForbidden();
    }

    public function test_operational_admin_role_cannot_manage_users_outside_its_hierarchy_scope(): void
    {
        $actor = $this->makeActor('depot', level: 'admin_master');
        $outsideUser = $this->makeActor('depot', 'REG-A', 'DEPOT-B');
        Sanctum::actingAs($actor);

        $this->getJson('/api/v1/users/'.$outsideUser->id)
            ->assertForbidden();

        $this->putJson('/api/v1/users/'.$outsideUser->id, [
            'full_name' => 'Nama yang Diubah',
        ])->assertForbidden();
    }

    public function test_profile_edit_does_not_revalidate_an_unchanged_existing_depot_scope(): void
    {
        $master = $this->makeActor('master');
        $target = $this->makeActor('depot');
        DepotSetting::where('kode_depo', $target->kode_depo)->update(['is_active' => false]);
        Sanctum::actingAs($master);

        $this->putJson('/api/v1/users/'.$target->id, [
            'full_name' => 'Updated User Name',
            'scope_level' => $target->scope_level,
            'region_id' => $target->region_id,
            'kode_depo' => $target->kode_depo,
            'nama_depo' => $target->nama_depo,
            'kode_ps' => $target->kode_ps,
            'depot_codes' => [$target->kode_depo],
        ])->assertOk();

        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'full_name' => 'Updated User Name',
            'kode_depo' => $target->kode_depo,
        ]);
    }

    public function test_scope_edit_still_rejects_a_new_inactive_depot_assignment(): void
    {
        $master = $this->makeActor('master');
        $target = $this->makeActor('depot');
        DepotSetting::create([
            'kode_depo' => 'DEPOT-INACTIVE',
            'nama_depo' => 'Depo Nonaktif',
            'region_id' => 'REG-A',
            'is_active' => false,
        ]);
        Sanctum::actingAs($master);

        $this->putJson('/api/v1/users/'.$target->id, [
            'scope_level' => 'depot',
            'region_id' => 'REG-A',
            'kode_depo' => 'DEPOT-INACTIVE',
            'nama_depo' => 'Depo Nonaktif',
            'depot_codes' => ['DEPOT-INACTIVE'],
        ])->assertStatus(422);

        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'kode_depo' => 'DEPOT-A',
        ]);
    }

    public function test_scope_edit_with_empty_depot_returns_a_clear_selection_error(): void
    {
        $master = $this->makeActor('master');
        $target = $this->makeActor('depot');
        Region::firstOrCreate(['code' => 'REG-B'], ['name' => 'REG-B']);
        Sanctum::actingAs($master);

        $this->putJson('/api/v1/users/'.$target->id, [
            'region_id' => 'REG-B',
            'kode_depo' => null,
            'nama_depo' => null,
            'depot_codes' => [],
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Pilih tepat satu depo aktif sebelum menyimpan perubahan scope.');

        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'region_id' => 'REG-A',
            'kode_depo' => 'DEPOT-A',
        ]);
    }

    public function test_only_master_scope_can_grant_global_depot_data_access(): void
    {
        $scopedAdmin = $this->makeActor(
            'depot',
            level: 'admin_master',
            permissions: ['roles.edit'],
        );
        $role = Role::create([
            'slug' => 'cross_depot_auditor',
            'name' => 'Cross Depot Auditor',
            'is_active' => true,
        ]);
        $globalDepotPermission = Permission::firstOrCreate(
            ['slug' => 'depot.view_all'],
            ['name' => 'Akses Semua Depo', 'menu_group' => 'Test', 'is_active' => true],
        );

        Sanctum::actingAs($scopedAdmin);
        $this->putJson("/api/v1/roles/{$role->id}/permissions", [
            'permission_ids' => [$globalDepotPermission->id],
        ])->assertForbidden();

        $master = $this->makeActor('master', level: 'staff_logistic', permissions: ['roles.edit']);
        Sanctum::actingAs($master);
        $this->putJson("/api/v1/roles/{$role->id}/permissions", [
            'permission_ids' => [$globalDepotPermission->id],
        ])->assertOk();

        $this->assertDatabaseHas('role_permission', [
            'role_id' => $role->id,
            'permission_id' => $globalDepotPermission->id,
        ]);
    }

    public function test_admin_master_level_does_not_grant_implicit_permissions(): void
    {
        $actor = $this->makeActor('depot', level: 'admin_master', permissions: []);

        $this->assertFalse($actor->hasPermission('depot.view_all'));
        $this->assertTrue($actor->isDepotScoped());
    }

    public function test_role_options_report_global_access_only_when_permission_is_assigned(): void
    {
        $master = $this->makeActor('master', level: 'staff_logistic', permissions: ['users.view']);
        $adminMasterRole = Role::firstOrCreate(
            ['slug' => 'admin_master'],
            ['name' => 'Admin Master', 'is_active' => true],
        );
        Sanctum::actingAs($master);

        $response = $this->getJson('/api/v1/users/role-options')->assertOk();
        $adminMasterOption = collect($response->json('data'))->firstWhere('slug', 'admin_master');

        $this->assertFalse($adminMasterOption['has_global_depot_access']);

        $viewAll = Permission::firstOrCreate(
            ['slug' => 'depot.view_all'],
            ['name' => 'Akses Semua Depo', 'menu_group' => 'Test', 'is_active' => true],
        );
        $adminMasterRole->permissions()->syncWithoutDetaching([$viewAll->id]);

        $response = $this->getJson('/api/v1/users/role-options')->assertOk();
        $adminMasterOption = collect($response->json('data'))->firstWhere('slug', 'admin_master');
        $this->assertTrue($adminMasterOption['has_global_depot_access']);
    }

    public function test_ps_user_requires_a_matching_region_depot_and_partner_site(): void
    {
        $master = $this->makeActor('master');
        $this->makeActor('master', 'REG-B', 'DEPOT-B', 'PS-B');
        PartnerSite::create([
            'kode_ps' => 'PS-A',
            'nama_ps' => 'Partner Site A',
            'kode_depo' => 'DEPOT-A',
            'is_active' => true,
        ]);
        Role::firstOrCreate(['slug' => 'staff_logistic'], ['name' => 'Staff Logistik', 'is_active' => true]);
        Sanctum::actingAs($master);

        $response = $this->postJson('/api/v1/users', [
            'full_name' => 'User PS',
            'email' => 'user-ps@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'level' => 'staff_logistic',
            'scope_level' => 'ps',
            'region_id' => 'REG-A',
            'kode_depo' => 'DEPOT-A',
            'depot_codes' => ['DEPOT-A'],
            'kode_ps' => 'PS-A',
        ])->assertCreated();

        $this->assertDatabaseHas('users', [
            'id' => $response->json('data.id'),
            'scope_level' => 'ps',
            'region_id' => 'REG-A',
            'kode_depo' => 'DEPOT-A',
            'kode_ps' => 'PS-A',
        ]);
        $this->assertSame(
            ['DEPOT-A'],
            DB::table('user_depots')->where('user_id', $response->json('data.id'))->pluck('kode_depo')->all(),
        );

        $this->postJson('/api/v1/users', [
            'full_name' => 'User PS Mismatch',
            'email' => 'user-ps-mismatch@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'level' => 'staff_logistic',
            'scope_level' => 'ps',
            'region_id' => 'REG-A',
            'kode_depo' => 'DEPOT-A',
            'depot_codes' => ['DEPOT-A'],
            'kode_ps' => 'PS-B',
        ])->assertStatus(422);
    }
}
