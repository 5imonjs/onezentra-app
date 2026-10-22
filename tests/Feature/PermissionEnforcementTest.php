<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Receiving;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PermissionEnforcementTest extends TestCase
{
    use RefreshDatabase;

    private function makeScopedUser(string $roleSlug, string $kodeDepo = 'DEPO-01'): User
    {
        $role = Role::firstOrCreate(['slug' => $roleSlug], [
            'name' => ucfirst($roleSlug),
            'description' => $kodeDepo,
        ]);

        $user = User::create([
            'email' => strtolower($roleSlug).'-'.strtolower($kodeDepo).'@depot.test',
            'password' => 'password',
            'full_name' => 'User '.$roleSlug,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo Satu',
            'level' => $roleSlug,
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function attach(User $user, string $slug, bool $permActive = true, bool $roleActive = true): void
    {
        // Lewat relasi `roles`, bukan kolom legacy `users.role_id` — kolom itu
        // sengaja tidak fillable lagi, sementara resolusi permission membaca
        // dari pivot `role_user`.
        $role = $user->roles()->firstOrFail();
        $role->update(['is_active' => $roleActive]);
        $perm = Permission::firstOrCreate(['slug' => $slug], [
            'name' => ucfirst($slug),
            'menu_group' => 'Test',
            'is_active' => $permActive,
        ]);
        $role->permissions()->attach($perm);
    }

    public function test_inactive_permission_is_not_granted(): void
    {
        $user = $this->makeScopedUser('admin_planner');
        $this->attach($user, 'rencana_kirim.view', permActive: false);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/rencana-kirim')->assertForbidden();
    }

    public function test_inactive_role_grants_no_permissions(): void
    {
        $user = $this->makeScopedUser('admin_planner');
        $this->attach($user, 'rencana_kirim.view', permActive: true, roleActive: false);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/rencana-kirim')->assertForbidden();
    }

    public function test_active_permission_on_active_role_is_granted(): void
    {
        $user = $this->makeScopedUser('admin_planner');
        $this->attach($user, 'rencana_kirim.view');
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/rencana-kirim')->assertOk();
    }

    public function test_register_forces_own_depot_for_depot_scoped_actor(): void
    {
        $actor = $this->makeScopedUser('staff_logistic', 'DEPO-A');
        $this->attach($actor, 'users.create');
        Sanctum::actingAs($actor);

        $response = $this->postJson('/api/v1/register', [
            'kode_depo' => 'DEPO-X',
            'nama_depo' => 'Depo Lain',
            'full_name' => 'User Baru',
            'email' => 'baru@depot.test',
            'password' => 'secret-123',
            'password_confirmation' => 'secret-123',
            'level' => 'staff_logistic',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('users', [
            'email' => 'baru@depot.test',
            'kode_depo' => 'DEPO-A',
        ]);
    }

    public function test_depo_list_is_available_without_rencana_kirim_view(): void
    {
        $user = $this->makeScopedUser('staff_logistic');
        $this->attach($user, 'reports.rencana_kirim');

        $this->makeScopedUser('staff_logistic', 'DEPO-B');

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/depo')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_receiving_delete_requires_receiving_delete_permission(): void
    {
        $user = $this->makeScopedUser('staff_logistic');
        $this->attach($user, 'receiving.delete');
        Sanctum::actingAs($user);

        $receiving = Receiving::create([
            'rencana_kirim_id' => RencanaKirim::create([
                'po_transporter' => 'SJ-DEL',
                'kode_depo' => 'DEPO-01',
                'nama_depo' => 'Depo Satu',
                'status' => 'VERIFIED',
                'created_by' => $user->id,
            ])->id,
            'status' => 'IN_PROGRESS',
        ]);

        $this->deleteJson("/api/v1/receivings/{$receiving->id}")->assertOk();
        $this->assertDatabaseMissing('receivings', ['id' => $receiving->id]);
    }

    public function test_receiving_delete_rejects_edit_without_delete_permission(): void
    {
        $user = $this->makeScopedUser('staff_logistic');
        $this->attach($user, 'receiving.edit');
        Sanctum::actingAs($user);

        $receiving = Receiving::create([
            'rencana_kirim_id' => RencanaKirim::create([
                'po_transporter' => 'SJ-NODEL',
                'kode_depo' => 'DEPO-01',
                'nama_depo' => 'Depo Satu',
                'status' => 'VERIFIED',
                'created_by' => $user->id,
            ])->id,
            'status' => 'IN_PROGRESS',
        ]);

        $this->deleteJson("/api/v1/receivings/{$receiving->id}")->assertForbidden();
    }
}
