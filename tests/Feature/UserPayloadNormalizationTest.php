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

/**
 * Regresi 422 "The kode depo field must be a string.".
 *
 * Klien lama mengirim identifier depo sebagai array satu elemen
 * (`{"kode_depo":["DPO"],"nama_depo":["Depo Test"]}`). Trait
 * NormalizesSingleDepotPayload menormalkannya sebelum validasi, sehingga
 * request yang sah diterima sebagai string tanpa melonggarkan aturan bisnis.
 */
class UserPayloadNormalizationTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        Region::firstOrCreate(['code' => 'REG-TEST'], ['name' => 'Region Test']);
        DepotSetting::updateOrCreate(
            ['kode_depo' => 'DPO'],
            ['nama_depo' => 'Depo Test', 'region_id' => 'REG-TEST', 'is_active' => true],
        );
        $role = Role::firstOrCreate(['slug' => 'admin'], ['name' => 'Admin Master']);
        Role::firstOrCreate(['slug' => 'blc'], ['name' => 'BLC', 'is_active' => true]);
        foreach (['users.create', 'users.edit', 'users.view', 'depot.view_all'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $admin = User::create([
            'email' => 'admin@onezentra.com',
            'password' => 'password',
            'full_name' => 'Admin Master',
            'kode_depo' => 'ADMIN',
            'nama_depo' => 'Kantor Pusat',
            'scope_level' => 'master',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        $role->users()->attach($admin->id);

        return $admin;
    }

    private function target(): User
    {
        return User::create([
            'email' => 'target-'.uniqid().'@test.com',
            'password' => 'secret123',
            'full_name' => 'User Target',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'region_id' => 'REG-TEST',
            'scope_level' => 'depot',
            'level' => 'blc',
            'status' => 'active',
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function storePayload(array $overrides = []): array
    {
        return array_merge([
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'region_id' => 'REG-TEST',
            'scope_level' => 'depot',
            'full_name' => 'User Baru',
            'email' => 'baru-'.uniqid().'@test.com',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
            'level' => 'blc',
        ], $overrides);
    }

    public function test_update_accepts_array_shaped_depot_fields(): void
    {
        Sanctum::actingAs($this->admin());
        $target = $this->target();

        $this->putJson("/api/v1/users/{$target->id}", [
            'kode_depo' => ['DPO'],
            'nama_depo' => ['Depo Test'],
            'full_name' => 'Nama Baru',
        ])
            ->assertOk()
            ->assertJsonMissingValidationErrors(['kode_depo', 'nama_depo'])
            ->assertJsonPath('data.kode_depo', 'DPO')
            ->assertJsonPath('data.nama_depo', 'Depo Test')
            ->assertJsonPath('data.full_name', 'Nama Baru');

        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'full_name' => 'Nama Baru',
        ]);
    }

    public function test_update_accepts_numeric_depot_code(): void
    {
        Sanctum::actingAs($this->admin());
        DepotSetting::updateOrCreate(
            ['kode_depo' => '126'],
            ['nama_depo' => 'Depo Numerik', 'region_id' => 'REG-TEST', 'is_active' => true],
        );

        $target = User::create([
            'email' => 'target-'.uniqid().'@test.com',
            'password' => 'secret123',
            'full_name' => 'User Numerik',
            'kode_depo' => '126',
            'nama_depo' => 'Depo Numerik',
            'region_id' => 'REG-TEST',
            'scope_level' => 'depot',
            'level' => 'blc',
            'status' => 'active',
        ]);

        $this->putJson("/api/v1/users/{$target->id}", [
            'kode_depo' => 126,
            'nama_depo' => 'Depo Numerik',
        ])
            ->assertOk()
            ->assertJsonMissingValidationErrors(['kode_depo']);

        $this->assertDatabaseHas('users', ['id' => $target->id, 'kode_depo' => '126']);
    }

    public function test_normalized_payload_still_rejects_unknown_depot(): void
    {
        Sanctum::actingAs($this->admin());
        $target = $this->target();

        $this->putJson("/api/v1/users/{$target->id}", [
            'kode_depo' => ['TIDAK-ADA'],
            'nama_depo' => ['Depo Hantu'],
            'region_id' => ['REG-TEST'],
            'depot_codes' => ['TIDAK-ADA'],
        ])
            ->assertStatus(422)
            ->assertJsonMissingValidationErrors(['kode_depo', 'nama_depo'])
            ->assertJsonPath('message', 'Depo akun wajib aktif dan valid.');

        $this->assertDatabaseHas('users', ['id' => $target->id, 'kode_depo' => 'DPO']);
    }

    public function test_store_accepts_array_shaped_depot_fields(): void
    {
        Sanctum::actingAs($this->admin());

        $id = $this->postJson('/api/v1/users', $this->storePayload([
            'kode_depo' => ['DPO'],
            'nama_depo' => ['Depo Test'],
            'region_id' => ['REG-TEST'],
            'depot_codes' => ['DPO'],
        ]))
            ->assertCreated()
            ->assertJsonMissingValidationErrors(['kode_depo', 'nama_depo', 'region_id'])
            ->json('data.id');

        $this->assertDatabaseHas('users', [
            'id' => $id,
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
        ]);
    }

    public function test_store_still_rejects_unknown_depot(): void
    {
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/v1/users', $this->storePayload([
            'kode_depo' => ['TIDAK-ADA'],
        ]))->assertJsonValidationErrors(['kode_depo']);

        $this->assertDatabaseMissing('users', ['kode_depo' => 'TIDAK-ADA']);
    }
}
