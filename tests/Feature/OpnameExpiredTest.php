<?php

namespace Tests\Feature;

use App\Imports\ReceivingItemImport;
use App\Models\Batch;
use App\Models\Npn;
use App\Models\OpnameExpiredWave;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use App\Services\OpnameExpiredService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OpnameExpiredTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo('2026-09-09 10:00:00');

        $role = Role::firstOrCreate(['slug' => 'opname_test'], ['name' => 'Opname Test']);
        foreach (['penerimaan.view', 'penerimaan.create', 'penerimaan.edit', 'opname.view', 'opname.create', 'opname.edit'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->user = User::create([
            'email' => 'opname@test.com',
            'password' => 'password',
            'full_name' => 'Opname User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'operator',
            'status' => 'active',
        ]);
        $role->users()->attach($this->user->id);

        Sanctum::actingAs($this->user);
    }

    private function receipt(string $kode, string $nama, float $qty, string $expired, string $tanggalTerima, ?float $pcs = null): ReceivingItem
    {
        return ReceivingItem::create([
            'source' => 'IMPORT_MANUAL',
            'kode_barang' => $kode,
            'nama_barang' => $nama,
            'actual_qty' => $qty,
            'expected_qty' => $qty,
            'qty_pcs' => $pcs ?? $qty,
            'satuan' => 'CRT',
            'expired_date' => $expired,
            'tanggal_penerimaan' => $tanggalTerima,
            'sumber_material' => 'PT Pengirim Test',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'condition' => 'GOOD',
            'scanned_by' => $this->user->id,
        ]);
    }

    public function test_generate_creates_wave_with_remaining_days_and_status(): void
    {
        $this->receipt('B-OP-01', 'Produk Aman', 10, '2027-01-01', '2026-09-09');
        $this->receipt('B-OP-02', 'Produk Kritis', 5, '2026-09-10', '2026-09-09');
        $this->receipt('B-OP-03', 'Produk Expired', 2, '2026-09-01', '2026-09-09');

        $result = app(OpnameExpiredService::class)->generate();

        $this->assertSame('2026-09-07', $result['week_start']);
        $this->assertSame('2026-09-13', $result['week_end']);
        $this->assertSame(3, $result['batches']);

        $this->assertDatabaseHas('opname_expired_waves', [
            'week_start' => '2026-09-07',
            'kode_barang' => 'B-OP-01',
            'sisa_hari' => 114,
            'status_ini' => 'AMAN',
            'qty_ini_crt' => 10,
        ]);

        $this->assertDatabaseHas('opname_expired_waves', [
            'week_start' => '2026-09-07',
            'kode_barang' => 'B-OP-02',
            'sisa_hari' => 1,
            'status_ini' => 'KRITIS',
        ]);

        $this->assertDatabaseHas('opname_expired_waves', [
            'week_start' => '2026-09-07',
            'kode_barang' => 'B-OP-03',
            'sisa_hari' => -8,
            'status_ini' => 'EXPIRED',
        ]);
    }

    public function test_generate_rolls_forward_quantity_to_next_week(): void
    {
        $this->receipt('B-OP-01', 'Produk Rolldir', 10, '2027-01-01', '2026-09-09');

        app(OpnameExpiredService::class)->generate();

        $this->travelTo('2026-09-16 10:00:00');
        $this->receipt('B-OP-01', 'Produk Rolldir', 5, '2027-01-01', '2026-09-14');

        $result = app(OpnameExpiredService::class)->generate();

        $this->assertSame('2026-09-14', $result['week_start']);

        $wave = OpnameExpiredWave::where('week_start', '2026-09-14')
            ->where('kode_barang', 'B-OP-01')
            ->first();

        $this->assertNotNull($wave);
        $this->assertEquals(10, $wave->qty_lalu_crt);
        $this->assertEquals(15, $wave->qty_ini_crt);
        $this->assertSame('NAIK +5', $wave->perubahan);
    }

    public function test_generate_carries_batch_forward_when_no_new_receiving(): void
    {
        $this->receipt('B-OP-01', 'Produk Lanjut', 10, '2026-10-01', '2026-09-09');
        app(OpnameExpiredService::class)->generate();

        $this->travelTo('2026-09-16 10:00:00');
        $result = app(OpnameExpiredService::class)->generate();

        $wave = OpnameExpiredWave::where('week_start', '2026-09-14')
            ->where('kode_barang', 'B-OP-01')
            ->first();

        $this->assertNotNull($wave);
        $this->assertEquals(10, $wave->qty_lalu_crt);
        $this->assertEquals(10, $wave->qty_ini_crt);
        $this->assertNotNull($result);
    }

    public function test_generate_does_not_roll_forward_expired_batch(): void
    {
        $this->receipt('B-OP-01', 'Produk Kadaluarsa', 10, '2026-09-01', '2026-09-09');
        app(OpnameExpiredService::class)->generate();

        $this->travelTo('2026-09-16 10:00:00');
        app(OpnameExpiredService::class)->generate();

        $this->assertDatabaseHas('opname_expired_waves', [
            'week_start' => '2026-09-07',
            'kode_barang' => 'B-OP-01',
            'status_ini' => 'EXPIRED',
        ]);

        $this->assertDatabaseMissing('opname_expired_waves', [
            'week_start' => '2026-09-14',
            'kode_barang' => 'B-OP-01',
        ]);
    }

    public function test_manual_receipt_import_via_api_sets_import_source(): void
    {
        Npn::create([
            'BOSnetszProductId' => 'B-IMP-01',
            'SAPszProductId' => 'SAP-IMP-01',
            'szNickName' => 'Produk Import',
            'decUomConversion1' => 12,
            'szStatus' => 'EXISTING',
        ]);

        $this->postJson('/api/v1/receiving-items', [
            'kode_barang' => 'B-IMP-01',
            'qty_crt' => 3,
            'qty_pcs' => 36,
            'expired_date' => '2027-01-01',
            'tanggal_penerimaan' => '2026-09-09',
            'sumber_material' => 'PT Pengirim',
        ])->assertCreated();

        $this->assertDatabaseHas('receiving_items', [
            'kode_barang' => 'B-IMP-01',
            'source' => 'IMPORT_MANUAL',
            'kode_depo' => 'DPO',
            'actual_qty' => 3,
            'qty_pcs' => 36,
            'sumber_material' => 'PT Pengirim',
        ]);
    }

    public function test_manual_receipt_rejects_zero_qty(): void
    {
        $this->postJson('/api/v1/receiving-items', [
            'kode_barang' => 'B-ZERO',
            'qty_crt' => 0,
            'expired_date' => '2027-01-01',
        ])->assertStatus(422);

        $this->assertDatabaseMissing('receiving_items', ['kode_barang' => 'B-ZERO']);
    }

    public function test_manual_receipt_derives_pcs_from_npn_conversion(): void
    {
        Npn::create([
            'BOSnetszProductId' => 'B-DERIVE',
            'szNickName' => 'Produk Derivasi',
            'decUomConversion1' => 12,
            'szStatus' => 'EXISTING',
        ]);

        $this->postJson('/api/v1/receiving-items', [
            'kode_barang' => 'B-DERIVE',
            'qty_crt' => 3,
            'expired_date' => '2027-01-01',
        ])->assertCreated();

        $this->assertDatabaseHas('receiving_items', [
            'kode_barang' => 'B-DERIVE',
            'qty_pcs' => 36,
        ]);
    }

    public function test_wave_update_records_validation_and_koreksi(): void
    {
        $this->receipt('B-OP-01', 'Produk Validasi', 10, '2027-01-01', '2026-09-09');
        app(OpnameExpiredService::class)->generate();

        $wave = OpnameExpiredWave::where('kode_barang', 'B-OP-01')->first();

        $this->putJson("/api/v1/opname-expired/{$wave->id}", [
            'qty_koreksi_crt' => -2,
        ])->assertOk();

        $wave->refresh();
        $this->assertEquals(-2, $wave->qty_koreksi_crt);
        $this->assertEquals(8, $wave->effectiveCrt());
        $this->assertNotNull($wave->koreksi_at);
        $this->assertSame($this->user->id, $wave->koreksi_by);
    }

    public function test_wave_koreksi_is_used_as_next_week_baseline(): void
    {
        $this->receipt('B-OP-01', 'Produk Koreksi', 10, '2026-12-01', '2026-09-09');
        app(OpnameExpiredService::class)->generate();

        $wave = OpnameExpiredWave::where('kode_barang', 'B-OP-01')->first();
        $wave->update([
            'qty_koreksi_crt' => -4,
            'koreksi_by' => $this->user->id,
            'koreksi_at' => now(),
        ]);

        $this->travelTo('2026-09-16 10:00:00');
        app(OpnameExpiredService::class)->generate();

        $next = OpnameExpiredWave::where('week_start', '2026-09-14')
            ->where('kode_barang', 'B-OP-01')
            ->first();

        $this->assertEquals(6, $next->qty_lalu_crt);
        $this->assertEquals(6, $next->qty_ini_crt);
    }

    public function test_receiving_item_import_from_excel_template(): void
    {
        // Template kolom dipetakan di ReceivingItemImport
        $import = new ReceivingItemImport($this->user);
        $collection = new Collection([[
            'kode_barang' => 'B-XL-01',
            'nama_barang' => 'Produk Excel',
            'qty_crt_zak' => '4',
            'qty_pcs' => '48',
            'tgl_expired_date' => '2027-05-01',
            'tgl_penerimaan' => '2026-09-09',
            'sumber_material' => 'PT Supplier',
        ]]);

        $import->collection($collection);

        $this->assertSame(1, $import->imported);
        $this->assertDatabaseHas('receiving_items', [
            'kode_barang' => 'B-XL-01',
            'source' => 'IMPORT_MANUAL',
            'kode_depo' => 'DPO',
            'actual_qty' => 4,
            'qty_pcs' => 48,
            'sumber_material' => 'PT Supplier',
        ]);
    }

    public function test_validasi_sj_item_falls_back_to_rencana_kirim_attributes(): void
    {
        $rk = RencanaKirim::create([
            'rkh_date' => '2026-09-01',
            'po_transporter' => 'PO-001',
            'driver_name' => 'Budi',
            'nopol' => 'B 1234 CD',
            'expedisi' => 'Ekspedisi X',
            'shipper_name' => 'PT Kirim Sumber',
            'kode_depo' => 'DEP1',
            'nama_depo' => 'Depo Satu',
            'total_qty' => 4,
            'status' => 'COMPLETED',
            'created_by' => $this->user->id,
            'scheduled_at' => now(),
        ]);

        $receiving = Receiving::create([
            'rencana_kirim_id' => $rk->id,
            'status' => 'COMPLETED',
            'total_expected_qty' => 4,
            'total_received_qty' => 4,
            'checked_by' => $this->user->id,
            'actual_arrival_time' => '2026-09-08 08:00:00',
            'actual_start_time' => '2026-09-08 08:05:00',
        ]);

        $item = ReceivingItem::create([
            'source' => ReceivingItem::SOURCE_VALIDASI,
            'receiving_id' => $receiving->id,
            'kode_barang' => 'B-SJ-01',
            'nama_barang' => 'Barang SJ',
            'actual_qty' => 4,
            'expected_qty' => 4,
            'expired_date' => '2027-01-01',
        ]);

        // Kolom kosong di DB, namun API/UI membaca nilai turunan dari rencana kirim.
        $this->assertSame('PT Kirim Sumber', $item->sumber_material);
        $this->assertSame('DEP1', $item->kode_depo);
        $this->assertSame('Depo Satu', $item->nama_depo);
        $this->assertSame('2026-09-08', $item->tanggal_penerimaan);
        $this->assertNull($item->getRawOriginal('sumber_material'));
    }

    public function test_import_computes_pcs_from_npn_conversion_fallback(): void
    {
        // decUomConversion1 kosong di produksi; konversi ada di BOSnetdecUom.
        Npn::create([
            'BOSnetszProductId' => 'B-FB-01',
            'SAPszProductId' => 'SAP-FB-01',
            'szNickName' => 'Produk Fallback',
            'BOSnetdecUom' => '15',
            'SAPszUomId' => 'CRT',
            'szStatus' => 'EXISTING',
        ]);

        $import = new ReceivingItemImport($this->user);
        $import->collection(new Collection([[
            'kode_barang' => 'B-FB-01',
            'qty_crt_zak' => '2',
            'tgl_expired_date' => '2027-06-01',
            'tgl_penerimaan' => '2026-09-09',
        ]]));

        $item = ReceivingItem::where('kode_barang', 'B-FB-01')->first();

        $this->assertNotNull($item);
        $this->assertEquals(30, $item->qty_pcs);
        $this->assertEquals(15, $item->conversion_factor);
        $this->assertSame('CRT', $item->satuan);
    }

    public function test_index_returns_status_summary_and_multi_status_filter(): void
    {
        $this->receipt('B-SUM-01', 'Produk Aman', 10, '2027-01-01', '2026-09-09');
        $this->receipt('B-SUM-02', 'Produk Kritis', 10, '2026-09-10', '2026-09-09');
        $this->receipt('B-SUM-03', 'Produk Perhatian', 10, '2026-10-10', '2026-09-09');
        $this->receipt('B-SUM-04', 'Produk Expired', 10, '2026-09-01', '2026-09-09');

        app(OpnameExpiredService::class)->generate();

        $res = $this->getJson('/api/v1/opname-expired')
            ->assertOk()
            ->assertJsonPath('meta.status_summary.AMAN.count', 1)
            ->assertJsonPath('meta.status_summary.PERHATIAN.count', 1)
            ->assertJsonPath('meta.status_summary.KRITIS.count', 1)
            ->assertJsonPath('meta.status_summary.EXPIRED.count', 1)
            ->assertJsonPath('meta.status_summary.AMAN.qty_crt', 10)
            ->assertJsonPath('meta.prev_week_start', '2026-08-31')
            ->assertJsonPath('meta.prev_status_summary.AMAN.count', 0);

        $this->assertSame(4, $res->json('meta.status_summary')['AMAN']['count'] + $res->json('meta.status_summary')['PERHATIAN']['count'] + $res->json('meta.status_summary')['KRITIS']['count'] + $res->json('meta.status_summary')['EXPIRED']['count']);

        $depot = $res->json('meta.depot_summary');
        $this->assertCount(4, $depot);
        $this->assertSame('DPO', $depot[0]['kode_depo']);
        $this->assertSame('AMAN', collect($depot)->sortBy('status')->first()['status']);
        $this->assertEquals(10, collect($depot)->sortBy('status')->first()['qty_crt']);

        $filtered = $this->getJson('/api/v1/opname-expired?statuses=KRITIS,EXPIRED')
            ->assertOk();

        $this->assertSame(2, $filtered->json('data.total'));
        $this->assertSame(['EXPIRED', 'KRITIS'], collect($filtered->json('data.data'))->pluck('status_ini')->unique()->sort()->values()->all());
    }

    public function test_cancelled_batch_is_excluded_from_opname(): void
    {
        // Batch label yang sudah tercetak jadi tidak berlaku begitu sesi
        // validasi dibatalkan (backend cancel() -> batches.status = CANCELLED).
        // Kalau Batch Expired tetap menghitungnya, operator akan melihat
        // stok yang labelnya sudah dibatalkan masih harus dikirim/retur.
        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-BATCH-TEST',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
        ]);

        $receiving = Receiving::create([
            'rencana_kirim_id' => $rencana->id,
            'status' => 'DRAFT',
        ]);

        $item = ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'source' => 'IMPORT_MANUAL',
            'kode_barang' => 'B-CANCEL-01',
            'nama_barang' => 'Produk Dibatalkan',
            'actual_qty' => 10,
            'expected_qty' => 10,
            'qty_pcs' => 10,
            'satuan' => 'CRT',
            'expired_date' => '2027-01-01',
            'tanggal_penerimaan' => '2026-09-09',
            'sumber_material' => 'PT Pengirim Test',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'condition' => 'GOOD',
            'scanned_by' => $this->user->id,
        ]);

        $batch = Batch::create([
            'batch_number' => 'BATCH-TEST01',
            'barcode_label' => 'LBL-TEST01',
            'receiving_id' => $receiving->id,
            'status' => 'ACTIVE',
        ]);

        app(OpnameExpiredService::class)->generate();
        $this->assertDatabaseHas('opname_expired_waves', [
            'kode_barang' => 'B-CANCEL-01',
            'qty_ini_crt' => 10,
        ]);

        // Batalkan sesi -> label jadi tidak berlaku.
        $batch->update(['status' => 'CANCELLED']);
        OpnameExpiredWave::query()->delete();

        app(OpnameExpiredService::class)->generate();

        $this->assertDatabaseMissing('opname_expired_waves', [
            'kode_barang' => 'B-CANCEL-01',
        ]);
    }
}
