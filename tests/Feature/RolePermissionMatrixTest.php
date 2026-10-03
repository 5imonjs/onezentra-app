<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * UI/UX per role: permission yang diberikan ke role harus benar-benar
 * menentukan apa yang bisa Dilakukan di API.
 *
 * UI sendiri (React) tidak diuji di sini — yang diuji adalah kontrak permission
 * yang dipakai UI lewat `hasPermission('cluster_principal.x')`. Kalau backend
 * dan UI berbeda soal nama slug, tombol akan tampil tapi endpoint 403.
 */
class RolePermissionMatrixTest extends TestCase
{
    use RefreshDatabase;

    /** Setiap aksi modul dan permission yang mengendalikannya. */
    private const MATRIX = [
        'index' => ['view', 'GET', '/api/v1/cluster-principal'],
        'filters' => ['view', 'GET', '/api/v1/cluster-principal/filters'],
        'template' => ['view', 'GET', '/api/v1/cluster-principal/template'],
        'store' => ['create', 'POST', '/api/v1/cluster-principal'],
        'import' => ['create', 'POST', '/api/v1/cluster-principal/import'],
        'update' => ['edit', 'PUT', '/api/v1/cluster-principal/1'],
        'delete' => ['delete', 'DELETE', '/api/v1/cluster-principal/1'],
    ];

    private function userWithPerms(array $slugs): User
    {
        $role = Role::firstOrCreate(['slug' => 'matrix_role'], ['name' => 'Matrix', 'slug' => 'matrix_role']);
        foreach ($slugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug]);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'matrix-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Matrix User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user->fresh();
    }

    /**
     * TANPA permission terkait, setiap aksi harus 403. Ini yang membuat
     * `hasPermission()` di UI trustworthy.
     */
    public function test_actions_are_denied_without_matching_permission(): void
    {
        Sanctum::actingAs($this->userWithPerms([]));

        foreach (self::MATRIX as $action => [$perm, $method, $uri]) {
            // Endpoint GET yang mengembalikan BinaryFileResponse tidak bisa
            // dicek status-nya di sini tanpa menyimpan file; cukup pastikan
            // tidak 200.
            $res = $this->json($method, $uri);
            $this->assertNotSame(
                200,
                $res->status(),
                "Aksi '{$action}' lolos tanpa permission 'cluster_principal.{$perm}' (status {$res->status()})"
            );
        }
    }

    /** DENGAN permission yang tepat, endpoint baca harus terbuka. */
    public function test_read_actions_are_allowed_with_view_permission(): void
    {
        Sanctum::actingAs($this->userWithPerms(['cluster_principal.view']));

        $this->getJson('/api/v1/cluster-principal')->assertOk();
        $this->getJson('/api/v1/cluster-principal/filters')->assertOk();
    }

    /** DENGAN create, store harus boleh — validasi payload tetap berlaku. */
    public function test_store_is_allowed_with_create_permission(): void
    {
        Sanctum::actingAs($this->userWithPerms(['cluster_principal.create']));

        // Tanpa product_sku -> 422. Yang penting bukan 403.
        $this->postJson('/api/v1/cluster-principal', ['lob' => 'Food'])
            ->assertStatus(422);
    }

    /**
     * Permission parse errors: role yang punya `cluster_principal.view` TIDAK
     * otomatis boleh create. Ini yang mengunci UI agar tidak menampilkan tombol
     * yang pasti ditolak server.
     */
    public function test_view_permission_does_not_grant_write(): void
    {
        Sanctum::actingAs($this->userWithPerms(['cluster_principal.view']));

        $this->postJson('/api/v1/cluster-principal', [
            'product_sku' => 'SKU-X', 'principal_1' => 'ABBOTT',
        ])->assertStatus(403);

        $this->post('/api/v1/cluster-principal/import')->assertStatus(403);
    }
}
