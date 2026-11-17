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

/**
 * Hitung retribusi mode "koli":
 *   nominal = qty_zak * rate_zak + qty_crt * rate_crt
 *
 * Nominal yang dikirim client untuk baris berbasis receiving HARUS diabaikan
 * (anti-manipulasi). Baris manual (tanpa receiving_id) selalu memakai nominal
 * manual, walau depo memakai mode koli.
 */
class BiayaRetribusiKoliCalcTest extends TestCase
{
    use RefreshDatabase;

    private function actingUser(): User
    {
        $permissions = collect([
            ['biaya_retribusi.create', 'Create'],
            ['biaya_retribusi.view', 'View'],
            ['penerimaan.edit', 'Edit Penerimaan'],
            ['depot.view_all', 'Akses Semua Depo'],
        ])->map(fn (array $permission): Permission => Permission::firstOrCreate(
            ['slug' => $permission[0]],
            ['name' => $permission[1], 'menu_group' => 'Test'],
        ));
        $role = Role::firstOrCreate(['slug' => 'biaya_retribusi_koli'], ['name' => 'Biaya Retribusi Koli']);
        $role->permissions()->syncWithoutDetaching($permissions->pluck('id'));

        $user = User::factory()->create([
            'level' => 'admin_master',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo DPO',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        Sanctum::actingAs($user);

        return $user;
    }

    private function koliRate(): void
    {
        RetribusiRate::create([
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo DPO',
            'mode' => 'koli',
            'rate_zak' => 1500,
            'rate_crt' => 2500,
            'is_active' => true,
        ]);
    }

    private function completedReceiving(User $checker): Receiving
    {
        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-KOLI-1',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo DPO',
            'status' => 'DRAFT',
        ]);

        return Receiving::create([
            'rencana_kirim_id' => $rencana->id,
            'status' => 'COMPLETED',
            'checked_by' => $checker->id,
        ]);
    }

    private function receivingItem(Receiving $receiving, string $satuan, float $qty): ReceivingItem
    {
        return ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'kode_barang' => 'SKU-KOLI',
            'nama_barang' => 'Barang Koli',
            'expected_qty' => $qty,
            'actual_qty' => $qty,
            'satuan' => $satuan,
            'condition' => 'FISIK_BAGUS',
            'source' => ReceivingItem::SOURCE_VALIDASI,
        ]);
    }

    public function test_nominal_koli_dihitung_dari_qty_dan_mengabaikan_nominal_client(): void
    {
        $user = $this->actingUser();
        $this->koliRate();
        $receiving = $this->completedReceiving($user);
        $this->receivingItem($receiving, 'ZAK', 10);
        $this->receivingItem($receiving, 'CRT', 4);

        $response = $this->postJson('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-10-16',
            'details' => [[
                'receiving_id' => $receiving->id,
                'nopol_kendaraan' => 'KB 1234 XX',
                'type_kendaraan' => 'CDD',
                'qty_zak' => 10,
                'qty_crt' => 4,
                'nominal_biaya' => 999999, // harus diabaikan oleh kalkulasi koli
            ]],
        ]);

        $response->assertCreated();

        $biaya = BiayaRetribusi::findOrFail($response->json('data.id'));
        $detail = $biaya->details()->first();

        // 10 * 1500 + 4 * 2500 = 25.000
        $this->assertSame(25000.0, (float) $detail->nominal_biaya);
        $this->assertSame(25000.0, (float) $biaya->nominal_biaya);
    }

    public function test_baris_manual_tanpa_receiving_tetap_memakai_nominal_manual(): void
    {
        $this->actingUser();
        $this->koliRate();

        $response = $this->postJson('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-10-16',
            'details' => [[
                'nopol_kendaraan' => 'KB 9999 ZZ',
                'type_kendaraan' => 'CDD',
                'qty_zak' => 10,
                'qty_crt' => 4,
                'nominal_biaya' => 123000,
            ]],
        ]);

        $response->assertCreated();

        $detail = BiayaRetribusi::findOrFail($response->json('data.id'))->details()->first();

        // Baris manual tidak ikut rumus koli meski depo mode koli.
        $this->assertSame(123000.0, (float) $detail->nominal_biaya);
    }

    public function test_qty_retribusi_diderivasi_dari_ledger_receiving_bukan_request_client(): void
    {
        $this->actingUser();
        $this->koliRate();
        $receiving = $this->completedReceiving(User::factory()->create());
        $this->receivingItem($receiving, 'ZAK', 10);
        $this->receivingItem($receiving, 'CRT', 4);

        $response = $this->postJson('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-10-16',
            'details' => [[
                'receiving_id' => $receiving->id,
                'nopol_kendaraan' => 'KB 1234 XX',
                'type_kendaraan' => 'CDD',
                'qty_zak' => 999, // stale/client — harus ditimpa ledger
                'qty_crt' => 888,
                'nominal_biaya' => 1,
            ]],
        ]);

        $response->assertCreated();

        $detail = BiayaRetribusi::findOrFail($response->json('data.id'))->details()->first();
        $this->assertEquals(10, (float) $detail->qty_zak);
        $this->assertEquals(4, (float) $detail->qty_crt);
        $this->assertSame(25000.0, (float) $detail->nominal_biaya);
    }

    public function test_qty_retribusi_draft_tersinkron_saat_qty_receiving_diubah(): void
    {
        $this->actingUser();
        $this->koliRate();
        $receiving = $this->completedReceiving(User::factory()->create());
        $item = $this->receivingItem($receiving, 'ZAK', 10);

        $response = $this->postJson('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-10-16',
            'details' => [[
                'receiving_id' => $receiving->id,
                'nopol_kendaraan' => 'KB 1234 XX',
                'type_kendaraan' => 'CDD',
                'qty_zak' => 10,
                'nominal_biaya' => 1,
            ]],
        ]);
        $response->assertCreated();
        $biaya = BiayaRetribusi::findOrFail($response->json('data.id'));

        $this->putJson("/api/v1/receiving-items/{$item->id}", ['qty_crt' => 14])->assertOk();

        $detail = $biaya->details()->first();
        $this->assertEquals(14, (float) $detail->qty_zak);
        $this->assertSame(21000.0, (float) $detail->nominal_biaya);
        $this->assertSame(21000.0, (float) $biaya->fresh()->nominal_biaya);

        // Pengajuan yang sudah dikirim TIDAK diubah diam-diam.
        $biaya->update(['status' => 'submitted']);
        $this->putJson("/api/v1/receiving-items/{$item->id}", ['qty_crt' => 20])->assertOk();

        $this->assertEquals(14, (float) $detail->fresh()->qty_zak);
        $this->assertSame(21000.0, (float) $biaya->fresh()->nominal_biaya);
    }
}
