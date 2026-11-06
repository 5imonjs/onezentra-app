<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NpnProvisionalTest extends TestCase
{
    use RefreshDatabase;

    private function npnCreator(): User
    {
        $user = User::create([
            'email' => 'npn-provisional@example.com',
            'password' => 'password',
            'full_name' => 'NPN Provisional Tester',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'operator',
            'status' => 'active',
        ]);

        $role = Role::firstOrCreate(['slug' => 'npn_provisional_tester'], ['name' => 'NPN Provisional Tester']);
        foreach (['npn.create', 'npn.view'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_can_create_provisional_npn_with_auto_generated_code(): void
    {
        Sanctum::actingAs($this->npnCreator());

        $res = $this->postJson('/api/v1/npn', [
            'szNickName' => 'Sirup Herbal XYZ 500ml',
            'szCompUomId' => 'CRT',
            'szBarcode' => '8990001',
            'is_provisional' => true,
            'provisional_note' => 'Terima batch ARCH-01; belum terdaftar di NPN/BOS',
        ])->assertCreated();

        $this->assertTrue($res->json('data.is_provisional'));
        $this->assertStringStartsWith('T-', $res->json('data.BOSnetszProductId'));
        $this->assertSame('Sirup Herbal XYZ 500ml', $res->json('data.szNickName'));
        $this->assertSame(
            'Terima batch ARCH-01; belum terdaftar di NPN/BOS',
            $res->json('data.provisional_note'),
        );
    }

    public function test_provisional_npn_keeps_explicit_bosid_and_product_flows_to_full_speed(): void
    {
        Sanctum::actingAs($this->npnCreator());

        $res = $this->postJson('/api/v1/npn', [
            'szNickName' => 'Gusi Sco',
            'BOSnetszProductId' => 'INV-MANUAL-001',
            'is_provisional' => true,
        ])->assertCreated();

        $this->assertSame('INV-MANUAL-001', $res->json('data.BOSnetszProductId'));

        // Bisa dicari biasa lewat search-product sebagaimana produk terdaftar.
        $this->getJson('/api/v1/npn/search-product?q=INV-MANUAL-001')
            ->assertOk();
    }

    public function test_provisional_npn_requires_product_name(): void
    {
        Sanctum::actingAs($this->npnCreator());

        $this->postJson('/api/v1/npn', [
            'szNickName' => '',
            'is_provisional' => true,
        ])->assertStatus(422);
    }

    public function test_normal_npn_creation_still_works(): void
    {
        Sanctum::actingAs($this->npnCreator());

        $res = $this->postJson('/api/v1/npn', [
            'szNickName' => 'Produk BOS Resmi',
            'BOSnetszProductId' => 'BOS-12345',
        ])->assertCreated();

        $this->assertFalse((bool) $res->json('data.is_provisional'));
    }
}
