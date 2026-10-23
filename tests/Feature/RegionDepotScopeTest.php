<?php

namespace Tests\Feature;

use App\Imports\UserImport;
use App\Models\DepotSetting;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
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

    public function test_user_import_assigns_active_custom_role_and_multiple_depots_in_region(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R1-B', 'REG-1');
        $admin = $this->makeUser('admin_master', 'ADMIN', 'Admin');
        $this->grant($admin, 'depot.view_all');
        $role = Role::create([
            'name' => 'Planner Custom',
            'slug' => 'planner_custom',
            'is_active' => true,
        ]);

        $import = new UserImport($admin);
        $import->collection(new Collection([[
            'email' => 'imported-planner@example.test',
            'full_name' => 'Planner Import',
            'level' => 'planner_custom',
            'region_id' => 'REG-1',
            'depot_codes' => 'R1-A, R1-B',
            'status' => 'active',
        ]]));

        $this->assertSame([], $import->errors);
        $user = User::where('email', 'imported-planner@example.test')->firstOrFail();
        $this->assertSame(1, $import->imported);
        $this->assertSame('REG-1', $user->region_id);
        $this->assertEqualsCanonicalizing(['R1-A', 'R1-B'], $user->depot_codes);
        $this->assertSame([$role->id], $user->roles()->pluck('roles.id')->all());
    }

    public function test_user_import_keeps_legacy_role_slugs_without_role_rows(): void
    {
        $admin = $this->makeUser('admin_master', 'ADMIN', 'Admin');
        $this->grant($admin, 'depot.view_all');

        $import = new UserImport($admin);
        $import->collection(new Collection([[
            'email' => 'legacy-role-import@example.test',
            'full_name' => 'Legacy Role',
            'level' => 'staff_logistic',
        ]]));

        $user = User::where('email', 'legacy-role-import@example.test')->firstOrFail();
        $this->assertSame(1, $import->imported);
        $this->assertSame([], $import->errors);
        $this->assertSame('staff_logistic', $user->level);
        $this->assertSame(0, $user->roles()->count());
    }

    public function test_user_import_rejects_depots_from_another_region(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R2-A', 'REG-2');
        $admin = $this->makeUser('admin_master', 'ADMIN', 'Admin');
        $this->grant($admin, 'depot.view_all');
        Role::create(['name' => 'Planner Custom', 'slug' => 'planner_custom', 'is_active' => true]);

        $import = new UserImport($admin);
        $import->collection(new Collection([[
            'email' => 'mismatched-planner@example.test',
            'full_name' => 'Mismatched Planner',
            'level' => 'planner_custom',
            'region_id' => 'REG-1',
            'depot_codes' => 'R2-A',
        ]]));

        $this->assertSame(0, $import->imported);
        $this->assertCount(1, $import->errors);
        $this->assertDatabaseMissing('users', ['email' => 'mismatched-planner@example.test']);
    }

    public function test_scoped_user_import_cannot_assign_a_depot_outside_actor_scope(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R1-B', 'REG-1');
        Role::firstOrCreate(['slug' => 'staff_logistic'], ['name' => 'Staff Logistik']);

        $actor = $this->makeUser('admin_planner', 'R1-A', 'Depo R1-A', 'REG-1');
        $this->grant($actor, 'users.import');
        DB::table('user_depots')->insert([
            'user_id' => $actor->id,
            'kode_depo' => 'R1-A',
            'assigned_at' => now(),
        ]);

        $import = new UserImport($actor);
        $import->collection(new Collection([[
            'email' => 'out-of-scope-import@example.test',
            'full_name' => 'Outside Scope',
            'level' => 'staff_logistic',
            'region_id' => 'REG-1',
            'depot_codes' => 'R1-B',
        ]]));

        $this->assertSame(0, $import->imported);
        $this->assertCount(1, $import->errors);
        $this->assertDatabaseMissing('users', ['email' => 'out-of-scope-import@example.test']);
    }

    public function test_user_import_updates_region_role_and_depot_assignments_together(): void
    {
        $this->makeDepot('R1-A', 'REG-1');
        $this->makeDepot('R2-A', 'REG-2');
        $admin = $this->makeUser('admin_master', 'ADMIN', 'Admin');
        $this->grant($admin, 'depot.view_all');
        $target = $this->makeUser('staff_logistic', 'R1-A', 'Depo R1-A', 'REG-1');
        DB::table('user_depots')->insert([
            'user_id' => $target->id,
            'kode_depo' => 'R1-A',
            'assigned_at' => now(),
        ]);
        $role = Role::create([
            'name' => 'Planner Custom',
            'slug' => 'planner_custom',
            'is_active' => true,
        ]);

        $import = new UserImport($admin);
        $import->collection(new Collection([[
            'email' => $target->email,
            'full_name' => $target->full_name,
            'level' => 'planner_custom',
            'region_id' => 'REG-2',
            'depot_codes' => 'R2-A',
            'status' => 'active',
        ]]));

        $updated = $target->fresh();
        $this->assertSame([], $import->errors);
        $this->assertSame(1, $import->updated);
        $this->assertSame('REG-2', $updated->region_id);
        $this->assertSame(['R2-A'], $updated->depot_codes);
        $this->assertSame('R2-A', $updated->kode_depo);
        $this->assertSame([$role->id], $updated->roles()->pluck('roles.id')->all());
        $this->assertDatabaseMissing('user_depots', [
            'user_id' => $updated->id,
            'kode_depo' => 'R1-A',
        ]);
    }

    public function test_planner_creates_and_sees_rencana_kirim_only_for_its_assigned_depot(): void
    {
        $this->makeDepot('ABC-A', 'REG-A', 'Depo ABC');
        $this->makeDepot('ABC-B', 'REG-B', 'Depo ABC');

        $plannerA = $this->makeUser('admin_planner', 'ABC-A', 'Depo ABC', 'REG-A');
        $this->grant($plannerA, 'depot.view_region');
        $this->grant($plannerA, 'rencana_kirim.view');
        $this->grant($plannerA, 'rencana_kirim.create');
        DB::table('user_depots')->insert([
            'user_id' => $plannerA->id,
            'kode_depo' => 'ABC-A',
            'assigned_at' => now(),
        ]);

        $plannerB = $this->makeUser('admin_planner', 'ABC-B', 'Depo ABC', 'REG-B');
        $this->grant($plannerB, 'depot.view_region');
        $this->grant($plannerB, 'rencana_kirim.view');
        $this->grant($plannerB, 'rencana_kirim.create');
        DB::table('user_depots')->insert([
            'user_id' => $plannerB->id,
            'kode_depo' => 'ABC-B',
            'assigned_at' => now(),
        ]);

        Sanctum::actingAs($plannerA);
        $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'PO-REG-A',
            'kode_depo' => 'ABC-A',
        ])->assertCreated()->assertJsonPath('data.kode_depo', 'ABC-A');

        Sanctum::actingAs($plannerB);
        $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'PO-REG-B',
            'kode_depo' => 'ABC-B',
        ])->assertCreated()->assertJsonPath('data.kode_depo', 'ABC-B');

        Sanctum::actingAs($plannerA);
        $this->getJson('/api/v1/rencana-kirim')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.po_transporter', 'PO-REG-A');
        $this->getJson('/api/v1/rencana-kirim?kode_depo=ABC-B')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.po_transporter', 'PO-REG-A');

        Sanctum::actingAs($plannerB);
        $this->getJson('/api/v1/rencana-kirim')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.po_transporter', 'PO-REG-B');
    }

    public function test_depot_code_cannot_be_reused_in_another_region(): void
    {
        $this->makeDepot('ABC', 'REG-A', 'Depo ABC');
        $this->expectException(QueryException::class);

        DepotSetting::create([
            'kode_depo' => 'ABC',
            'nama_depo' => 'Depo ABC Region B',
            'region_id' => 'REG-B',
            'is_active' => true,
        ]);
    }
}
