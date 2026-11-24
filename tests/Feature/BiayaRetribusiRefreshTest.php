<?php

namespace Tests\Feature;

use App\Models\BiayaRetribusi;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\RetribusiRate;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiayaRetribusiRefreshTest extends TestCase
{
    use RefreshDatabase;

    private function actingUser(): User
    {
        $permissions = collect([
            'biaya_retribusi.create', 'biaya_retribusi.view', 'biaya_retribusi.edit',
            'penerimaan.edit', 'penerimaan.delete', 'receiving.delete', 'rencana_kirim.delete', 'depot.view_all',
        ])->map(fn (string $slug): Permission => Permission::firstOrCreate(
            ['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test'],
        ));
        $role = Role::firstOrCreate(['slug' => 'biaya_retribusi_refresh'], ['name' => 'Refresh Test']);
        $role->permissions()->syncWithoutDetaching($permissions->pluck('id'));

        $user = User::factory()->create([
            'level' => 'admin_master', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo DPO', 'status' => 'active',
        ]);
        $role->users()->attach($user->id);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_refresh_menarik_qty_terbaru_dari_receiving(): void
    {
        $user = $this->actingUser();
        RetribusiRate::create([
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo DPO', 'mode' => 'koli',
            'rate_zak' => 1500, 'rate_crt' => 2500, 'is_active' => true,
        ]);

        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-REFRESH-1', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo DPO', 'status' => 'DRAFT',
        ]);
        $receiving = Receiving::create([
            'rencana_kirim_id' => $rencana->id, 'status' => 'COMPLETED', 'checked_by' => $user->id,
        ]);
        $item = ReceivingItem::create([
            'receiving_id' => $receiving->id, 'kode_barang' => 'SKU-REF', 'nama_barang' => 'Barang Refresh',
            'expected_qty' => 4, 'actual_qty' => 4, 'satuan' => 'CRT',
            'condition' => 'FISIK_BAGUS', 'source' => ReceivingItem::SOURCE_VALIDASI,
        ]);

        $created = $this->postJson('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-11-01',
            'details' => [[
                'receiving_id' => $receiving->id,
                'nopol_kendaraan' => 'KB 1234 XX', 'type_kendaraan' => 'CDD',
                'qty_zak' => 0, 'qty_crt' => 4, 'nominal_biaya' => 0,
            ]],
        ])->assertCreated();

        $biaya = BiayaRetribusi::findOrFail($created->json('data.id'));
        $this->assertSame(10000.0, (float) $biaya->details()->first()->nominal_biaya);

        // Qty di penerimaan dikoreksi (misal validasi SJ lapangan).
        $item->update(['actual_qty' => 9]);

        $this->postJson("/api/v1/biaya-retribusi/{$biaya->id}/refresh")->assertOk();

        $biaya->refresh();
        $detail = $biaya->details()->first();
        $this->assertSame(9.0, (float) $detail->qty_crt);
        $this->assertSame(22500.0, (float) $detail->nominal_biaya);
        $this->assertSame(22500.0, (float) $biaya->nominal_biaya);
    }

    public function test_refresh_tidak_mengubah_baris_manual_tanpa_receiving(): void
    {
        $this->actingUser();
        RetribusiRate::create([
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo DPO', 'mode' => 'koli',
            'rate_zak' => 1500, 'rate_crt' => 2500, 'is_active' => true,
        ]);

        $created = $this->postJson('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-11-01',
            'details' => [[
                'nopol_kendaraan' => 'KB 9999 ZZ', 'type_kendaraan' => 'CDD',
                'qty_zak' => 0, 'qty_crt' => 3, 'nominal_biaya' => 777000,
            ]],
        ])->assertCreated();

        $biaya = BiayaRetribusi::findOrFail($created->json('data.id'));
        $this->postJson("/api/v1/biaya-retribusi/{$biaya->id}/refresh")->assertOk();

        $this->assertSame(777000.0, (float) $biaya->details()->first()->nominal_biaya);
    }

    public function test_menghapus_receiving_dicegah_saat_dipakai_detail_retribusi(): void
    {
        $user = $this->actingUser();
        RetribusiRate::create([
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo DPO', 'mode' => 'koli',
            'rate_zak' => 1500, 'rate_crt' => 2500, 'is_active' => true,
        ]);
        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-HAPUS-1', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo DPO', 'status' => 'DRAFT',
        ]);
        $receiving = Receiving::create([
            'rencana_kirim_id' => $rencana->id, 'status' => 'COMPLETED', 'checked_by' => $user->id,
        ]);
        ReceivingItem::create([
            'receiving_id' => $receiving->id, 'kode_barang' => 'SKU-HAPUS', 'nama_barang' => 'Barang',
            'expected_qty' => 2, 'actual_qty' => 2, 'satuan' => 'CRT',
            'condition' => 'FISIK_BAGUS', 'source' => ReceivingItem::SOURCE_VALIDASI,
        ]);

        $created = $this->postJson('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-11-01',
            'details' => [[
                'receiving_id' => $receiving->id,
                'nopol_kendaraan' => 'KB 1234 XX', 'type_kendaraan' => 'CDD',
                'qty_zak' => 0, 'qty_crt' => 2, 'nominal_biaya' => 0,
            ]],
        ])->assertCreated();
        $biayaId = $created->json('data.id');

        $this->deleteJson("/api/v1/receivings/{$receiving->id}")->assertStatus(422);

        $this->deleteJson("/api/v1/rencana-kirim/{$rencana->id}")->assertStatus(422);

        $this->assertNotNull(BiayaRetribusi::find($biayaId));
        $this->assertNotNull($receiving->fresh());
    }
}
