<?php

namespace Tests\Feature;

use App\Exports\StandarUmurProdukExport;
use App\Imports\StandarUmurProdukImport;
use App\Models\Permission;
use App\Models\Role;
use App\Models\StandarUmurProduk;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StandarUmurProdukTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'standar_umur_admin'], ['name' => 'Standar Umur Admin']);
        foreach (['standar_umur.view', 'standar_umur.create', 'standar_umur.edit', 'standar_umur.delete'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->user = User::create([
            'email' => 'standar-umur@test.com',
            'password' => 'password',
            'full_name' => 'Standar Umur User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'admin_master',
            'status' => 'active',
            'role_id' => $role->id,
        ]);
        $role->users()->attach($this->user->id);

        Sanctum::actingAs($this->user);
    }

    public function test_index_returns_paginated_data(): void
    {
        StandarUmurProduk::create(['material' => 'MAT-001', 'material_description' => 'Produk A', 'brand' => 'Brand A', 'category' => 'CAT-A']);
        StandarUmurProduk::create(['material' => 'MAT-002', 'material_description' => 'Produk B', 'brand' => 'Brand B', 'category' => 'CAT-B']);

        $this->getJson('/api/v1/standar-umur-produk')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_index_search_filter(): void
    {
        StandarUmurProduk::create(['material' => 'MAT-001', 'material_description' => 'Produk Alpha']);
        StandarUmurProduk::create(['material' => 'MAT-002', 'material_description' => 'Produk Beta']);

        $this->getJson('/api/v1/standar-umur-produk?search=Alpha')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_store_creates_product(): void
    {
        $this->postJson('/api/v1/standar-umur-produk', [
            'material' => 'MAT-NEW',
            'material_description' => 'Produk Baru',
            'brand' => 'Brand X',
            'category' => 'CAT-X',
            'min_doi' => 10,
            'target_doi' => 30,
            'max_doi' => 60,
        ])->assertCreated()->assertJsonPath('data.material', 'MAT-NEW');
    }

    public function test_show_returns_single_product(): void
    {
        $item = StandarUmurProduk::create(['material' => 'MAT-001', 'material_description' => 'Produk A']);

        $this->getJson("/api/v1/standar-umur-produk/{$item->id}")->assertOk()->assertJsonPath('data.material', 'MAT-001');
    }

    public function test_update_modifies_product(): void
    {
        $item = StandarUmurProduk::create(['material' => 'MAT-001', 'material_description' => 'Old']);

        $this->putJson("/api/v1/standar-umur-produk/{$item->id}", ['material_description' => 'New'])
            ->assertOk()->assertJsonPath('data.material_description', 'New');
    }

    public function test_destroy_removes_product(): void
    {
        $item = StandarUmurProduk::create(['material' => 'MAT-001']);

        $this->deleteJson("/api/v1/standar-umur-produk/{$item->id}")->assertOk();
        $this->assertDatabaseMissing('standar_umur_produk', ['id' => $item->id]);
    }

    public function test_bulk_destroy_removes_multiple(): void
    {
        $a = StandarUmurProduk::create(['material' => 'A']);
        $b = StandarUmurProduk::create(['material' => 'B']);

        $this->postJson('/api/v1/standar-umur-produk/bulk-delete', ['ids' => [$a->id, $b->id]])->assertOk();
        $this->assertDatabaseMissing('standar_umur_produk', ['id' => $a->id]);
        $this->assertDatabaseMissing('standar_umur_produk', ['id' => $b->id]);
    }

    public function test_brand_filter(): void
    {
        StandarUmurProduk::create(['material' => 'A', 'brand' => 'X']);
        StandarUmurProduk::create(['material' => 'B', 'brand' => 'Y']);

        $this->getJson('/api/v1/standar-umur-produk?brand=X')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_category_filter(): void
    {
        StandarUmurProduk::create(['material' => 'A', 'category' => 'FOOD']);
        StandarUmurProduk::create(['material' => 'B', 'category' => 'BEV']);

        $this->getJson('/api/v1/standar-umur-produk?category=FOOD')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_export_returns_xlsx(): void
    {
        StandarUmurProduk::create(['material' => 'A', 'material_description' => 'Test']);

        $this->get('/api/v1/standar-umur-produk/export')->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    public function test_store_persists_all_form_fields(): void
    {
        $this->postJson('/api/v1/standar-umur-produk', [
            'material' => 'MAT-FULL',
            'material_description' => 'Produk Full',
            'trigger_point' => 14,
            'max_point' => 20,
            'supply_pattern' => 'Daily',
            'skugrp' => 'GRP-1',
            'vol_m3' => 0.0456,
            'weight_kg' => 8.16,
            'sku_status' => 'Aktif',
            'nickname' => 'NICK',
            'sku_fokus_nka' => '1',
            'allocation_start' => '2026-01-01',
        ])->assertCreated();

        $this->assertDatabaseHas('standar_umur_produk', [
            'material' => 'MAT-FULL',
            'trigger_point' => 14,
            'max_point' => 20,
            'supply_pattern' => 'Daily',
            'skugrp' => 'GRP-1',
            'sku_status' => 'Aktif',
            'nickname' => 'NICK',
            'allocation_start' => '2026-01-01',
        ]);
    }

    public function test_update_persists_previously_dropped_fields(): void
    {
        $item = StandarUmurProduk::create(['material' => 'MAT-001', 'material_description' => 'Old']);

        $this->putJson("/api/v1/standar-umur-produk/{$item->id}", [
            'trigger_point' => 14,
            'sku_status' => 'Aktif',
            'nickname' => 'NICK',
            'vol_m3' => 0.0456,
        ])->assertOk();

        $this->assertDatabaseHas('standar_umur_produk', [
            'id' => $item->id,
            'trigger_point' => 14,
            'sku_status' => 'Aktif',
            'nickname' => 'NICK',
        ]);
    }

    public function test_index_sorts_by_umur_desc(): void
    {
        StandarUmurProduk::create(['material' => 'A', 'material_description' => 'PA', 'umur' => 5]);
        StandarUmurProduk::create(['material' => 'B', 'material_description' => 'PB', 'umur' => 12]);
        StandarUmurProduk::create(['material' => 'C', 'material_description' => 'PC', 'umur' => 8]);

        $res = $this->getJson('/api/v1/standar-umur-produk?sort=umur&direction=desc');

        $res->assertOk();
        $this->assertSame([12, 8, 5], array_column($res->json('data'), 'umur'));
    }

    public function test_index_ignores_unknown_sort_column(): void
    {
        StandarUmurProduk::create(['material' => 'B', 'material_description' => 'Zulu']);
        StandarUmurProduk::create(['material' => 'A', 'material_description' => 'Alpha']);

        $res = $this->getJson('/api/v1/standar-umur-produk?sort=password&direction=desc');

        $res->assertOk();
        $this->assertSame(['Alpha', 'Zulu'], array_column($res->json('data'), 'material_description'));
    }

    public function test_import_rejects_oversize_file(): void
    {
        $file = UploadedFile::fake()->create('besar.xlsx', 11000, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        $this->postJson('/api/v1/standar-umur-produk/import', ['file' => $file])->assertStatus(422);
    }

    public function test_export_query_respects_brand_filter(): void
    {
        StandarUmurProduk::create(['material' => 'A', 'brand' => 'X']);
        StandarUmurProduk::create(['material' => 'B', 'brand' => 'Y']);

        $brands = (new StandarUmurProdukExport(brand: 'X'))->query()->pluck('brand')->unique()->values()->all();

        $this->assertSame(['X'], $brands);
    }

    public function test_export_query_sorts_by_umur_desc(): void
    {
        StandarUmurProduk::create(['material' => 'A', 'material_description' => 'PA', 'umur' => 5]);
        StandarUmurProduk::create(['material' => 'B', 'material_description' => 'PB', 'umur' => 12]);

        $umurs = (new StandarUmurProdukExport(sort: 'umur', direction: 'desc'))->query()->pluck('umur')->all();

        $this->assertSame([12, 5], $umurs);
    }

    public function test_import_maps_template_headings(): void
    {
        $import = new StandarUmurProdukImport;
        $import->collection(collect([collect([
            // Kunci = slug kanonis heading template (hasil WithHeadingRow).
            'material' => 'MAT-001',
            'material_description' => 'Produk A',
            'mindoi' => '10',
            'targetdoi' => '17',
            'maxdoi' => '31',
            'skugrp' => 'GRP-1',
            'skuconv' => '1',
            'vol_m3' => '0.0456',
            'weight_kg' => '8.16',
            'metricton' => '0.0082',
            'typesku' => 'Standalone',
            'skustatus' => 'Aktif',
            'madein' => 'Domestic',
            'supplier_productid' => 'SUP-1',
            'nickname' => 'NICK',
            'sku_fokus_nka' => '1',
            'isi_sap' => '60',
        ])]));

        $this->assertSame(1, $import->imported);
        $this->assertDatabaseHas('standar_umur_produk', [
            'material' => 'MAT-001',
            'min_doi' => 10,
            'target_doi' => 17,
            'max_doi' => 31,
            'skugrp' => 'GRP-1',
            'type_sku' => 'Standalone',
            'sku_status' => 'Aktif',
            'nickname' => 'NICK',
            'isi_sap' => '60',
        ]);
    }
}
