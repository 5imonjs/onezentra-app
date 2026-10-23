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

class DepotSettingTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $level, string $kodeDepo, array $permSlugs = []): User
    {
        Region::firstOrCreate(['code' => 'REG-TEST'], ['name' => 'Test']);
        if ($level === 'admin_master') {
            $permSlugs[] = 'depot_settings.manage';
        }
        $role = Role::firstOrCreate(['slug' => 'depot-setting-'.$level], ['name' => 'Depot Setting '.$level]);
        foreach ($permSlugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => $level.'-'.strtolower($kodeDepo).'-'.uniqid().'@test.com',
            'password' => 'password',
            'full_name' => 'User '.$level,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'region_id' => 'REG-TEST',
            'scope_level' => $level === 'admin_master' ? 'master' : 'depot',
            'level' => $level,
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_index_requires_authentication(): void
    {
        $this->getJson('/api/v1/depot-settings')->assertUnauthorized();
    }

    public function test_scoped_user_only_sees_own_depot(): void
    {
        DepotSetting::create(['kode_depo' => 'DPA', 'nama_depo' => 'Depo A', 'alamat_pengirim' => 'Jl A']);
        DepotSetting::create(['kode_depo' => 'DPB', 'nama_depo' => 'Depo B', 'alamat_pengirim' => 'Jl B']);

        Sanctum::actingAs($this->user('blc', 'DPA'));

        $this->getJson('/api/v1/depot-settings')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.kode_depo', 'DPA');
    }

    public function test_depot_scope_limits_hierarchy_listing_even_with_view_all_permission(): void
    {
        DepotSetting::create(['kode_depo' => 'DPA', 'nama_depo' => 'Depo A']);
        DepotSetting::create(['kode_depo' => 'DPB', 'nama_depo' => 'Depo B']);

        Sanctum::actingAs($this->user('admin_planner', 'DPA', ['depot.view_all']));

        $this->getJson('/api/v1/depot-settings')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.kode_depo', 'DPA');
    }

    public function test_show_forbidden_for_other_depot_when_scoped(): void
    {
        DepotSetting::create(['kode_depo' => 'DPB', 'nama_depo' => 'Depo B', 'alamat_pengirim' => 'Jl B']);

        Sanctum::actingAs($this->user('blc', 'DPA'));

        $this->getJson('/api/v1/depot-settings/DPB')->assertForbidden();
    }

    public function test_show_returns_setting_for_own_depot(): void
    {
        DepotSetting::create(['kode_depo' => 'DPA', 'nama_depo' => 'Depo A', 'alamat_pengirim' => 'Jl A']);

        Sanctum::actingAs($this->user('blc', 'DPA'));

        $this->getJson('/api/v1/depot-settings/DPA')
            ->assertOk()
            ->assertJsonPath('data.alamat_pengirim', 'Jl A');
    }

    public function test_show_forbids_lookup_outside_scope_even_when_missing(): void
    {
        Sanctum::actingAs($this->user('admin_planner', 'DPA', ['depot.view_all']));

        $this->getJson('/api/v1/depot-settings/XXX')->assertForbidden();
    }

    public function test_upsert_forbidden_for_non_master(): void
    {
        Sanctum::actingAs($this->user('admin_planner', 'DPA', ['depot.view_all']));

        $this->putJson('/api/v1/depot-settings/DPA', ['alamat_pengirim' => 'Jl Baru'])
            ->assertForbidden();
    }

    public function test_upsert_forbidden_for_non_master_walau_permission_diberikan(): void
    {
        // Gate ganda: middleware permission lolos (grant manual), tetapi
        // controller meng-gate ulang level admin_master — tetap 403.
        Sanctum::actingAs($this->user('admin_planner', 'DPA', ['depot_settings.manage']));

        $this->putJson('/api/v1/depot-settings/DPA', ['alamat_pengirim' => 'Jl Baru'])
            ->assertForbidden();
    }

    public function test_upsert_allowed_for_admin_master(): void
    {
        Sanctum::actingAs($this->user('admin_master', 'DPA'));

        $this->putJson('/api/v1/depot-settings/DPA', [
            'nama_depo' => 'Depo A',
            'alamat_pengirim' => 'Jl Baru',
            'nama_tujuan' => 'Depo A',
            'alamat_tujuan' => 'Jl Baru',
        ])
            ->assertOk()
            ->assertJsonPath('data.kode_depo', 'DPA')
            ->assertJsonPath('data.alamat_pengirim', 'Jl Baru');

        $this->assertDatabaseHas('depot_settings', [
            'kode_depo' => 'DPA',
            'alamat_pengirim' => 'Jl Baru',
        ]);
    }

    public function test_admin_master_can_assign_depot_to_a_region(): void
    {
        Region::create(['code' => 'REG-01', 'name' => 'Region Satu']);
        DepotSetting::create(['kode_depo' => 'DPA', 'nama_depo' => 'Depo A']);
        Sanctum::actingAs($this->user('admin_master', 'DPA'));

        $this->putJson('/api/v1/depot-settings/DPA', ['region_id' => 'REG-01'])
            ->assertOk()
            ->assertJsonPath('data.region_id', 'REG-01');

        $this->assertDatabaseHas('depot_settings', [
            'kode_depo' => 'DPA',
            'region_id' => 'REG-01',
        ]);
    }

    public function test_region_code_is_validated(): void
    {
        Sanctum::actingAs($this->user('admin_master', 'DPA'));

        $this->putJson('/api/v1/depot-settings/DPA', ['region_id' => str_repeat('R', 21)])
            ->assertJsonValidationErrors(['region_id']);
    }

    public function test_upsert_validates_email(): void
    {
        Sanctum::actingAs($this->user('admin_master', 'DPA'));

        $this->putJson('/api/v1/depot-settings/DPA', ['email_pengirim' => 'bukan-email'])
            ->assertJsonValidationErrors(['email_pengirim']);
    }
}
