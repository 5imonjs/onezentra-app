<?php

namespace Tests\Feature;

use App\Models\DepotSetting;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RegionDepotScopeTest extends TestCase
{
    use RefreshDatabase;

    private int $userSeq = 0;

    private function makeUser(string $level, string $kodeDepo, string $namaDepo, ?string $regionId = null): User
    {
        $role = Role::firstOrCreate(['slug' => 'test_'.$kodeDepo], [
            'name' => ucfirst($level),
            'description' => $namaDepo,
        ]);

        $user = User::create([
            'email' => strtolower($kodeDepo).'-'.(++$this->userSeq).'@region.test',
            'password' => 'password',
            'full_name' => 'User '.$namaDepo,
            'kode_depo' => $kodeDepo,
            'nama_depo' => $namaDepo,
            'region_id' => $regionId,
            'level' => $level,
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function grant(User $user, string $slug): void
    {
        $perm = Permission::firstOrCreate(['slug' => $slug], [
            'name' => ucfirst($slug),
            'menu_group' => 'Test',
        ]);
        $user->roles()->firstOrFail()->permissions()->attach($perm);
    }

    private function makeDepot(string $kodeDepo, string $regionId, ?string $namaDepo = null): void
    {
        DepotSetting::updateOrCreate(
            ['kode_depo' => $kodeDepo],
            [
                'nama_depo' => $namaDepo ?? 'Depo '.$kodeDepo,
                'region_id' => $regionId,
                'is_active' => true,
            ]
        );
    }

    public function test_region_user_sees_only_assigned_depots_within_region(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R1-B', 'REG-1');
        $this->makeDepot('R2-A', 'REG-2');

        $user = $this->makeUser('admin_planner', 'R1-A', 'Depo A', 'REG-1');
        $this->grant($user, 'depot.view_region');
        $this->grant($user, 'rencana_kirim.view');
        DB::table('user_depots')->insert([
            'user_id' => $user->id,
            'kode_depo' => 'R1-A',
            'assigned_at' => now(),
        ]);

        RencanaKirim::create(['po_transporter' => 'SJ-R1A', 'kode_depo' => 'R1-A', 'nama_depo' => 'Depo R1-A', 'status' => 'DRAFT', 'created_by' => $user->id]);
        RencanaKirim::create(['po_transporter' => 'SJ-R1B', 'kode_depo' => 'R1-B', 'nama_depo' => 'Depo R1-B', 'status' => 'DRAFT', 'created_by' => $user->id]);
        RencanaKirim::create(['po_transporter' => 'SJ-R2A', 'kode_depo' => 'R2-A', 'nama_depo' => 'Depo R2-A', 'status' => 'DRAFT', 'created_by' => $user->id]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/rencana-kirim');

        $response->assertOk();
        $this->assertEqualsCanonicalizing(
            ['SJ-R1A'],
            collect($response->json('data'))->pluck('po_transporter')->all()
        );
    }

    public function test_region_id_without_permission_falls_back_to_legacy_depot(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R1-B', 'REG-1');

        // Tanpa permission depot.view_region: region_id tidak mengubah akses.
        $user = $this->makeUser('admin_planner', 'R1-A', 'Depo A', 'REG-1');
        $this->grant($user, 'rencana_kirim.view');

        RencanaKirim::create(['po_transporter' => 'SJ-R1A', 'kode_depo' => 'R1-A', 'nama_depo' => 'Depo R1-A', 'status' => 'DRAFT', 'created_by' => $user->id]);
        RencanaKirim::create(['po_transporter' => 'SJ-R1B', 'kode_depo' => 'R1-B', 'nama_depo' => 'Depo R1-B', 'status' => 'DRAFT', 'created_by' => $user->id]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/rencana-kirim');

        $response->assertOk();
        $this->assertSame(['SJ-R1A'], collect($response->json('data'))->pluck('po_transporter')->all());
    }

    public function test_region_user_cannot_bypass_region_via_depot_filter(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R2-A', 'REG-2');

        $user = $this->makeUser('admin_planner', 'R1-A', 'Depo A', 'REG-1');
        $this->grant($user, 'depot.view_region');
        $this->grant($user, 'rencana_kirim.view');

        RencanaKirim::create(['po_transporter' => 'SJ-R1A', 'kode_depo' => 'R1-A', 'nama_depo' => 'Depo R1-A', 'status' => 'DRAFT', 'created_by' => $user->id]);
        RencanaKirim::create(['po_transporter' => 'SJ-R2A', 'kode_depo' => 'R2-A', 'nama_depo' => 'Depo R2-A', 'status' => 'DRAFT', 'created_by' => $user->id]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/rencana-kirim?kode_depo=R2-A');

        $response->assertOk();
        $this->assertSame(['SJ-R1A'], collect($response->json('data'))->pluck('po_transporter')->all());
    }

    public function test_region_user_can_be_assigned_only_depots_in_their_region(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R1-B', 'REG-1');
        $this->makeDepot('R2-A', 'REG-2');

        $admin = $this->makeUser('admin_master', 'ADMIN', 'Admin');
        $admin->forceFill(['region_id' => null])->save();
        $this->grant($admin, 'depot.view_all');
        $this->grant($admin, 'users.view');
        $this->grant($admin, 'users.edit');

        $target = $this->makeUser('admin_planner', 'R1-A', 'Depo A', 'REG-1');
        $this->grant($target, 'depot.view_region');

        Sanctum::actingAs($admin);

        $this->putJson("/api/v1/users/{$target->id}/depots", [
            'depot_codes' => ['R1-A'],
        ])->assertOk();

        $this->assertSame(['R1-A'], $target->fresh()->depot_codes);

        $this->putJson("/api/v1/users/{$target->id}/depots", [
            'depot_codes' => ['R2-A'],
        ])->assertStatus(422);
    }

    public function test_scoped_actor_cannot_assign_another_depot_in_the_same_region(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R1-B', 'REG-1');

        $actor = $this->makeUser('admin_planner', 'R1-A', 'Depo A', 'REG-1');
        $this->grant($actor, 'users.view');
        $this->grant($actor, 'users.edit');
        $this->grant($actor, 'users.create');

        $target = $this->makeUser('staff_logistic', 'R1-A', 'Depo A', 'REG-1');
        Sanctum::actingAs($actor);

        $this->putJson("/api/v1/users/{$target->id}/depots", [
            'depot_codes' => ['R1-B'],
        ])->assertForbidden();

        $this->assertSame(['R1-A'], $target->fresh()->depot_codes);

        Role::firstOrCreate(['slug' => 'staff_logistic'], ['name' => 'Staff Logistik']);
        $this->postJson('/api/v1/users', [
            'full_name' => 'User Depot B',
            'email' => 'depot-b-user@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'level' => 'staff_logistic',
            'region_id' => 'REG-1',
            'depot_codes' => ['R1-B'],
        ])->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'depot-b-user@example.test']);
    }

    public function test_store_user_persists_selected_depots_atomically_and_rejects_other_regions(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R1-B', 'REG-1');
        $this->makeDepot('R2-A', 'REG-2');

        $admin = $this->makeUser('admin_master', 'ADMIN', 'Admin');
        $this->grant($admin, 'depot.view_all');
        $this->grant($admin, 'users.create');
        Role::firstOrCreate(['slug' => 'staff_logistic'], ['name' => 'Staff Logistik']);
        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/users', [
            'full_name' => 'User Region 1',
            'email' => 'region-user@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'level' => 'staff_logistic',
            'region_id' => 'REG-1',
            'depot_codes' => ['R1-A', 'R1-B'],
        ])->assertCreated();

        $user = User::where('email', 'region-user@example.test')->firstOrFail();
        $this->assertEqualsCanonicalizing(['R1-A', 'R1-B'], $user->depot_codes);

        $this->postJson('/api/v1/users', [
            'full_name' => 'User Mismatch',
            'email' => 'mismatch-user@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'level' => 'staff_logistic',
            'region_id' => 'REG-1',
            'depot_codes' => ['R2-A'],
        ])->assertStatus(422);

        $this->assertDatabaseMissing('users', ['email' => 'mismatch-user@example.test']);
    }

    public function test_get_depots_reports_region_permission_and_explicit_assignments(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R1-B', 'REG-1');
        $this->makeDepot('R2-A', 'REG-2');

        $admin = $this->makeUser('admin_master', 'ADMIN', 'Admin');
        $this->grant($admin, 'depot.view_all');
        $this->grant($admin, 'users.view');

        $target = $this->makeUser('admin_planner', 'R1-A', 'Depo A', 'REG-1');
        $this->grant($target, 'depot.view_region');

        Sanctum::actingAs($admin);

        $response = $this->getJson("/api/v1/users/{$target->id}/depots");

        $response->assertOk()
            ->assertJsonPath('has_region_permission', true)
            ->assertJsonPath('region_id', 'REG-1');

        $assigned = collect($response->json('data'))->where('assigned', true)->pluck('kode_depo')->all();
        $this->assertSame(['R1-A'], $assigned);
    }

    public function test_user_can_clear_all_depot_assignments_without_legacy_fallback(): void
    {
        $this->makeDepot('R1-A', 'REG-1');

        $admin = $this->makeUser('admin_master', 'ADMIN', 'Admin');
        $this->grant($admin, 'depot.view_all');
        $this->grant($admin, 'users.view');
        $this->grant($admin, 'users.edit');

        $target = $this->makeUser('admin_planner', 'R1-A', 'Depo A', 'REG-1');
        Sanctum::actingAs($admin);

        $this->putJson("/api/v1/users/{$target->id}/depots", [
            'depot_codes' => [],
        ])->assertOk();

        $this->assertSame([], $target->fresh()->depot_codes);
        $this->assertSame('', $target->fresh()->kode_depo);
    }

    public function test_non_admin_master_cannot_change_region_id(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R1-B', 'REG-1');

        $actor = $this->makeUser('admin_planner', 'R1-A', 'Planner A');
        $this->grant($actor, 'users.edit');
        $this->grant($actor, 'users.view');

        $target = $this->makeUser('cheker', 'R1-A', 'Cheker A');

        Sanctum::actingAs($actor);

        $this->putJson("/api/v1/users/{$target->id}", [
            'region_id' => 'REG-1',
        ])->assertForbidden();

        $this->assertNull($target->fresh()->region_id);
    }
}
