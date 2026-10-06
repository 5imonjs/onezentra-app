<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReceivingItemControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'receiving_edit'], ['name' => 'Receiving Edit']);
        foreach (['penerimaan.view', 'penerimaan.edit', 'penerimaan.delete'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Penerimaan']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->user = User::create([
            'email' => 'receiving-edit@test.com',
            'password' => 'password',
            'full_name' => 'Receiving User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($this->user->id);

        Sanctum::actingAs($this->user);
    }

    private function makeItem(string $source = 'IMPORT_MANUAL'): ReceivingItem
    {
        return ReceivingItem::create([
            'source' => $source,
            'kode_barang' => 'TES-MANUAL',
            'nama_barang' => 'Test Manual',
            'expected_qty' => 10,
            'actual_qty' => 10,
            'qty_pcs' => 100,
            'satuan' => 'CRT',
            'expired_date' => '2026-12-01',
            'tanggal_penerimaan' => '2026-09-01',
            'sumber_material' => 'SHA',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'condition' => 'GOOD',
        ]);
    }

    public function test_update_receiving_item_sj_and_manual(): void
    {
        $item = $this->makeItem('VALIDASI_SJ');

        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'qty_crt' => 8,
            'qty_pcs' => 80,
            'expired_date' => '2026-12-15',
            'condition' => 'GOOD',
            'kode_depo' => '0127',
        ])->assertOk()->assertJsonPath('data.kode_barang', 'TES-MANUAL');

        $fresh = $item->fresh();
        $this->assertEquals('8.00', (string) $fresh->actual_qty);
        // Jejak ekspektasi dipertahankan, selisih dihitung ulang (bukan dinolkan).
        $this->assertEquals('10.00', (string) $fresh->expected_qty);
        $this->assertEquals(-2, (float) $fresh->selisih_qty);
        $this->assertEquals('2026-12-15', $fresh->expired_date->toDateString());
        $this->assertSame('VALIDASI_SJ', $fresh->source);
        // User depot-scoped tidak bisa memindahkan baris ke depo lain.
        $this->assertSame('DPO', $fresh->kode_depo);
    }

    public function test_update_other_depot_row_is_forbidden(): void
    {
        $item = $this->makeItem();
        $item->update(['kode_depo' => 'LAIN', 'nama_depo' => 'Depo Lain']);

        $this->putJson("/api/v1/receiving-items/{$item->id}", ['qty_crt' => 1])
            ->assertForbidden();
        $this->deleteJson("/api/v1/receiving-items/{$item->id}")
            ->assertForbidden();
    }

    public function test_update_recomputes_qty_pcs_from_conversion_factor(): void
    {
        $item = $this->makeItem('VALIDASI_SJ');
        $item->update(['conversion_factor' => 12, 'qty_pcs' => 120]);

        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'qty_crt' => 8,
            'expired_date' => '2026-12-15',
        ])->assertOk();

        $fresh = $item->fresh();
        $this->assertEquals('8.00', (string) $fresh->actual_qty);
        $this->assertEquals('96.00', (string) $fresh->qty_pcs);
    }

    public function test_update_normalizes_condition_to_canonical_vocabulary(): void
    {
        $item = $this->makeItem('VALIDASI_SJ');

        $this->putJson("/api/v1/receiving-items/{$item->id}", ['condition' => 'GOOD'])->assertOk();
        $this->assertSame('FISIK_BAGUS', $item->fresh()->condition);

        // Kondisi bermasalah tanpa foto ditolak (sejajar validasi SJ).
        $this->putJson("/api/v1/receiving-items/{$item->id}", ['condition' => 'NOT GOOD'])->assertStatus(422);
    }

    public function test_update_partial_fields_keeps_others(): void
    {
        $item = $this->makeItem();

        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'sumber_material' => 'PABRIK A',
        ])->assertOk();

        $fresh = $item->fresh();
        $this->assertSame('PABRIK A', $fresh->sumber_material);
        $this->assertEquals('10.00', (string) $fresh->actual_qty);
        $this->assertEquals('2026-12-01', $fresh->expired_date->toDateString());
    }

    public function test_update_without_edit_permission_is_forbidden(): void
    {
        $item = $this->makeItem();
        $limited = User::create([
            'email' => 'limited@test.com',
            'password' => 'password',
            'full_name' => 'Limited User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role = Role::firstOrCreate(['slug' => 'receiving_view_only'], ['name' => 'Receiving View']);
        $perm = Permission::firstOrCreate(['slug' => 'penerimaan.view'], ['name' => 'penerimaan.view']);
        $role->permissions()->syncWithoutDetaching([$perm->id]);
        $role->users()->attach($limited->id);

        Sanctum::actingAs($limited);

        $this->putJson("/api/v1/receiving-items/{$item->id}", ['qty_crt' => 1])
            ->assertForbidden();
    }
}
