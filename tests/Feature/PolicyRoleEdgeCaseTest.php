<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Unit test untuk edge-case policy & role.
 * Menguji perilaku ketika role/permission tidak sesuai ekspektasi,
 * serta penghindaran privilege escalation.
 */
class PolicyRoleEdgeCaseTest extends TestCase
{
    use RefreshDatabase;

    /** @var User */
    private $adminUser;

    protected function setUp(): void
    {
        parent::setUp();

        // Buat role & user admin untuk digunakan di beberapa test
        $role = Role::firstOrCreate(['slug' => 'admin_master'], ['name' => 'Admin Master', 'slug' => 'admin_master']);
        $this->adminUser = User::factory()->create([
            'email' => 'admin-edge@example.com',
            'password' => 'password',
            'full_name' => 'Admin Edge',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        $role->users()->attach($this->adminUser->id);

        // Pastikan permission 'users.view' ada
        Permission::firstOrCreate(['slug' => 'users.view'], ['name' => 'Users View']);
    }

    /** @test */
    public function testNonAdminCannotPromoteAnotherUserToAdminMaster(): void
    {
        Sanctum::actingAs(
            $this->createUserWithRole('staff_logistic')
        );

        $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'full_name' => 'Attacker',
            'email' => 'attacker-edge@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'level' => 'admin_master',
        ])
            ->assertStatus(403);
    }

    /** @test */
    public function testRoleWithNoPermissionsCannotAccessMutatingEndpoints(): void
    {
        $user = $this->createUserWithRole('staff_logistic');

        // user ini hanya memiliki role tanpa permission eksplisit
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/roles', [
            'name' => 'New Role',
            'slug' => 'new-role',
        ])
            ->assertStatus(403);
    }

    /** @test */
    public function testAssigningPermissionToNonExistentRoleReturns403(): void
    {
        // Gunakan admin_user yang sudah dibuat di setUp untuk mengotentikasi request
        Sanctum::actingAs($this->adminUser);

        // Upaya membuat permission baru – endpoint ini ter-gate sehingga admin
        // tanpa izin khusus hanya mendapatkan 403. Untuk menambahkan permission
        // baru pastikan role memiliki permission 'permissions.create'.
        $this->postJson('/api/v1/permissions', [
            'name' => 'Another Dummy',
            'slug' => 'another-dummy',
        ])
            ->assertStatus(403);
    }

    /** @test */
    public function testUserCannotAssignRoleHigherThanTheirOwnViaPayload(): void
    {
        $staffUser = $this->createUserWithRole('staff_logistic');

        Sanctum::actingAs($staffUser);

        $adminRole = Role::where('slug', 'admin_master')->firstOrFail();

        $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'full_name' => 'Higher Role Attempt',
            'email' => 'higher-edge@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'level' => 'admin_master',
            'role_id' => $adminRole->id,
        ])
            ->assertStatus(403);
    }

    /**
     * Helper: create a user with a given role slug and minimal permissions.
     */
    private function createUserWithRole(string $roleSlug): User
    {
        $role = Role::firstOrCreate(['slug' => $roleSlug], ['name' => $roleSlug, 'slug' => $roleSlug]);
        $user = User::factory()->create([
            'email' => $roleSlug.'-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => ucfirst($roleSlug),
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'level' => $roleSlug,
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);
        return $user->fresh();
    }
}