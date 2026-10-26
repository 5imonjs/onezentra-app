<?php

namespace Tests\Feature;

use App\Imports\NpnImport;
use App\Models\Npn;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FullFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        // Buat role + permissions lengkap
        $role = Role::firstOrCreate(['slug' => 'fullflow'], ['name' => 'Full Flow']);
        $perms = [
            'rencana_kirim.view', 'rencana_kirim.create', 'rencana_kirim.edit', 'rencana_kirim.delete',
            'gate.view', 'gate.create',
            'sj_validation.view', 'sj_validation.create', 'sj_validation.validate', 'sj_validation.complete', 'sj_validation.delete',
            'receiving.view', 'receiving.create', 'receiving.edit',
        ];
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->user = User::create([
            'email' => 'fullflow@test.com',
            'password' => 'password',
            'full_name' => 'Full Flow User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($this->user->id);

        Sanctum::actingAs($this->user);
    }

    /**
     * Test alur lengkap: Rencana Kirim → Gate → Validasi → Receiving → COMPLETED
     */
    public function test_full_flow_rencana_to_receiving_completed(): void
    {
        // 1. Buat NPN
        $npn = Npn::create([
            'szNickName' => 'Produk Flow Test',
            'BOSnetszProductId' => 'B-FLW-01',
            'SAPszProductId' => 'SAP-FLW-01',
            'szBarcode' => 'BC-FLW-01',
            'szStatus' => 'EXISTING',
        ]);

        // 2. Buat Rencana Kirim → DRAFT
        $rk = RencanaKirim::create([
            'po_transporter' => 'SJ-FLW-001',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'driver_name' => 'Driver Flow',
            'nopol' => 'B 1234 FLOW',
            'status' => 'DRAFT',
            'created_by' => $this->user->id,
        ]);
        RencanaKirimItem::create([
            'rencana_kirim_id' => $rk->id,
            'npn_id' => $npn->id,
            'item_number' => 1,
            'kode_barang' => 'B-FLW-01',
            'nama_barang' => 'Produk Flow Test',
            'jumlah' => 10,
            'satuan' => 'CRT',
        ]);

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'DRAFT']);

        // 3. Schedule → SCHEDULED
        $this->postJson("/api/v1/rencana-kirim/{$rk->id}/schedule")->assertOk();
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'SCHEDULED']);

        // 4. Gate In → CHECKED_IN
        $this->postJson('/api/v1/gate-transactions', [
            'rencana_kirim_id' => $rk->id,
            'gate_type' => 'INBOUND',
        ])->assertCreated();
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'CHECKED_IN']);

        // 5. Mulai Validasi SJ
        $startRes = $this->postJson("/api/v1/sj-validations/start/{$rk->id}")->assertOk();
        $validationId = $startRes->json('data.id');
        $itemId = $startRes->json('data.items.0.id');

        $this->assertDatabaseHas('sj_validations', ['id' => $validationId, 'status' => 'IN_PROGRESS']);
        $this->assertDatabaseHas('sj_validation_items', ['id' => $itemId, 'status' => 'PENDING']);

        // 6. Scan item → qty cocok → VALIDATED
        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 10,
            'expired_date' => '2027-01-31',
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();

        $this->assertDatabaseHas('sj_validation_items', ['id' => $itemId, 'status' => 'VALIDATED']);

        // 7. Selesaikan Validasi → COMPLETED, rencana_kirim → VERIFIED
        $this->postJson("/api/v1/sj-validations/{$validationId}/complete")->assertOk();
        $this->assertDatabaseHas('sj_validations', ['id' => $validationId, 'status' => 'COMPLETED']);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'VERIFIED']);

        // 8. Verifikasi auto-create Receiving + ReceivingItems
        $this->assertDatabaseHas('receivings', [
            'rencana_kirim_id' => $rk->id,
            'status' => 'PENDING',
        ]);

        $receiving = Receiving::where('rencana_kirim_id', $rk->id)->first();
        $this->assertNotNull($receiving);

        $receivingItem = ReceivingItem::where('receiving_id', $receiving->id)->first();
        $this->assertNotNull($receivingItem);
        $this->assertEquals('B-FLW-01', $receivingItem->kode_barang);
        $this->assertEquals(10, $receivingItem->actual_qty);
        $this->assertEquals('FISIK_BAGUS', $receivingItem->condition);
        $this->assertEquals($itemId, $receivingItem->sj_validation_item_id);

        // 9. Quick Scan → temukan Receiving PENDING
        $searchRes = $this->getJson('/api/v1/receivings?search=SJ-FLW-001')->assertOk();
        $this->assertNotEmpty($searchRes->json('data'));

        // 10. Complete Receiving → COMPLETED
        $this->postJson("/api/v1/receivings/{$receiving->id}/complete", [
            'barcode' => 'SJ-FLW-001',
        ])->assertOk();

        $this->assertDatabaseHas('receivings', ['id' => $receiving->id, 'status' => 'COMPLETED']);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'COMPLETED']);
    }

    /**
     * Test validasi: qty tidak cocok → MISMATCH
     */
    public function test_validation_mismatch_qty(): void
    {
        $npn = Npn::create([
            'szNickName' => 'Produk Mismatch',
            'BOSnetszProductId' => 'B-MIS-01',
            'szStatus' => 'EXISTING',
        ]);
        $rk = RencanaKirim::create([
            'po_transporter' => 'SJ-MIS-001',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'status' => 'CHECKED_IN',
            'created_by' => $this->user->id,
        ]);
        RencanaKirimItem::create([
            'rencana_kirim_id' => $rk->id,
            'npn_id' => $npn->id,
            'item_number' => 1,
            'kode_barang' => 'B-MIS-01',
            'nama_barang' => 'Produk Mismatch',
            'jumlah' => 10,
            'satuan' => 'CRT',
        ]);

        // Mulai validasi
        $startRes = $this->postJson("/api/v1/sj-validations/start/{$rk->id}")->assertOk();
        $validationId = $startRes->json('data.id');
        $itemId = $startRes->json('data.items.0.id');

        // Scan dengan qty berbeda
        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 8,
            'expired_date' => '2027-01-31',
        ])->assertOk();

        $this->assertDatabaseHas('sj_validation_items', ['id' => $itemId, 'status' => 'MISMATCH']);

        // Selesaikan validasi tetap bisa (meskipun MISMATCH)
        $this->postJson("/api/v1/sj-validations/{$validationId}/complete")->assertOk();

        // Receiving auto-create dengan actual_qty dari validasi
        $receiving = Receiving::where('rencana_kirim_id', $rk->id)->first();
        $this->assertNotNull($receiving);
        $this->assertEquals('PENDING', $receiving->status);

        $receivingItem = ReceivingItem::where('receiving_id', $receiving->id)->first();
        $this->assertEquals(8, $receivingItem->actual_qty); // qty dari validasi, bukan 10
    }

    /**
     * Test: validasi tidak boleh duplicate create Receiving
     */
    public function test_validation_complete_does_not_duplicate_receiving(): void
    {
        $npn = Npn::create([
            'szNickName' => 'Produk Dup',
            'BOSnetszProductId' => 'B-DUP-01',
            'szStatus' => 'EXISTING',
        ]);

        // Buat dua rencana kirim terpisah dengan po_transporter berbeda
        $rk1 = RencanaKirim::create([
            'po_transporter' => 'SJ-DUP-001',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'status' => 'CHECKED_IN',
            'created_by' => $this->user->id,
        ]);
        RencanaKirimItem::create([
            'rencana_kirim_id' => $rk1->id,
            'npn_id' => $npn->id,
            'item_number' => 1,
            'kode_barang' => 'B-DUP-01',
            'nama_barang' => 'Produk Dup',
            'jumlah' => 5,
            'satuan' => 'CRT',
        ]);

        // Mulai + selesaikan validasi untuk rencana 1
        $startRes = $this->postJson("/api/v1/sj-validations/start/{$rk1->id}")->assertOk();
        $validationId = $startRes->json('data.id');
        $itemId = $startRes->json('data.items.0.id');

        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 5,
            'expired_date' => '2027-01-31',
        ])->assertOk();

        $this->postJson("/api/v1/sj-validations/{$validationId}/complete")->assertOk();

        $count1 = Receiving::where('rencana_kirim_id', $rk1->id)->count();
        $this->assertEquals(1, $count1);

        // Verifikasi ReceivingItem punya sj_validation_item_id
        $receiving = Receiving::where('rencana_kirim_id', $rk1->id)->first();
        $receivingItem = ReceivingItem::where('receiving_id', $receiving->id)->first();
        $this->assertNotNull($receivingItem->sj_validation_item_id);
        $this->assertEquals($itemId, $receivingItem->sj_validation_item_id);
    }

    /**
     * Test: NpnImport isi kode_depo dari user
     */
    public function test_npn_import_sets_depo_from_user(): void
    {
        $npnImport = new NpnImport($this->user);
        $collection = new Collection([[
            'bosnetszproductid' => 'B-IMP-01',
            'sznickname' => 'Produk Import',
            'szshortdescription' => 'Deskripsi Import',
        ]]);

        $npnImport->collection($collection);

        $this->assertDatabaseHas('npn', [
            'BOSnetszProductId' => 'B-IMP-01',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $this->user->id,
        ]);
    }

    /**
     * Test: NpnImport update existing tidak overwrite created_by
     */
    public function test_npn_import_does_not_overwrite_created_by_on_update(): void
    {
        // Buat NPN existing dengan created_by milik user lain yang valid
        $otherUser = User::create([
            'email' => 'other-npn@test.com',
            'password' => 'password',
            'full_name' => 'Other NPN Owner',
            'kode_depo' => 'OLD',
            'nama_depo' => 'Old Depo',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $npn = Npn::create([
            'BOSnetszProductId' => 'B-UPD-01',
            'szNickName' => 'Produk Update',
            'created_by' => $otherUser->id,
            'kode_depo' => 'OLD',
            'nama_depo' => 'Old Depo',
        ]);

        // Import dengan kode yang sama
        $npnImport = new NpnImport($this->user);
        $collection = new Collection([[
            'bosnetszproductid' => 'B-UPD-01',
            'sznickname' => 'Produk Update New',
        ]]);

        $npnImport->collection($collection);

        // created_by TIDAK boleh berubah
        $this->assertDatabaseHas('npn', [
            'id' => $npn->id,
            'created_by' => $otherUser->id,
            'szNickName' => 'Produk Update New',
        ]);

        // kode_depo/nama_depo adalah provenance importer pertama dan TIDAK
        // boleh direbut oleh import depo lain; NPN dibaca global, mutasinya
        // tetap di-scope ke pemilik asli.
        $this->assertDatabaseHas('npn', [
            'id' => $npn->id,
            'kode_depo' => 'OLD',
            'nama_depo' => 'Old Depo',
        ]);
    }

    /**
     * Test: scan item mengirim tier & tinggi → standarisasi tumpukan tersimpan
     * sebagai pending, dan businessInfo/show menyertakan data standarisasi.
     */
    public function test_scan_item_stores_stack_standardisation_from_validation(): void
    {
        $npn = Npn::create([
            'szNickName' => 'Produk Stack',
            'BOSnetszProductId' => 'B-STK-01',
            'szBarcode' => 'BC-STK-01',
            'szStatus' => 'EXISTING',
        ]);
        $rk = RencanaKirim::create([
            'po_transporter' => 'SJ-STK-001',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'status' => 'CHECKED_IN',
            'created_by' => $this->user->id,
        ]);
        RencanaKirimItem::create([
            'rencana_kirim_id' => $rk->id,
            'npn_id' => $npn->id,
            'item_number' => 1,
            'kode_barang' => 'B-STK-01',
            'nama_barang' => 'Produk Stack',
            'jumlah' => 10,
            'satuan' => 'CRT',
        ]);

        $startRes = $this->postJson("/api/v1/sj-validations/start/{$rk->id}")->assertOk();
        $validationId = $startRes->json('data.id');
        $itemId = $startRes->json('data.items.0.id');

        // Produk belum punya standarisasi → item tidak punya atribut standarisasi
        $this->assertNull($startRes->json('data.items.0.standarisasi'));

        // Item baru default condition FISIK_BAGUS (bukan 'GOOD') agar bisa divalidasi
        // tanpa mengubah kondisi terlebih dahulu
        $this->assertSame('FISIK_BAGUS', $startRes->json('data.items.0.condition'));

        // Scan dengan tier & tinggi tumpukan → standarisasi tersimpan pending
        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 10,
            'expired_date' => '2027-01-31',
            'condition' => 'FISIK_BAGUS',
            'tier' => 4,
            'tinggi_tumpukan' => 120,
        ])->assertOk();

        $this->assertDatabaseHas('standarisasi_tumpukan', [
            'npn_id' => $npn->id,
            'tier' => 4,
            'tinggi_tumpukan' => 120,
            'total_tier_tinggi' => 480,
            'status' => 'pending',
            'requested_by' => $this->user->id,
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
        ]);

        // Detail validasi menampilkan reminder standarisasi (data tersimpan)
        $showRes = $this->getJson("/api/v1/sj-validations/{$validationId}")->assertOk();
        $this->assertSame(4, $showRes->json('data.items.0.standarisasi.tier'));
        $this->assertSame(120, $showRes->json('data.items.0.standarisasi.tinggi_tumpukan'));
    }
}
