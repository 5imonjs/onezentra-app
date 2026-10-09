<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Npn;
use App\Models\OpnameExpiredSession;
use App\Models\OpnameExpiredWave;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use App\Services\OpnameExpiredService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Uji coba rantai penuh: rencana kirim → gate → validasi SJ (label terbit)
 * → receiving → generate opname → sesi lapangan → verifikasi → selesai.
 * Identitas batch ditelusuri ujung-ke-ujung.
 */
class OpnameEndToEndTest extends TestCase
{
    use RefreshDatabase;

    private User $planner;

    private User $checker;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo('2026-09-09 10:00:00');

        $role = Role::firstOrCreate(['slug' => 'opname_e2e'], ['name' => 'Opname E2E']);
        foreach ([
            'rencana_kirim.view', 'rencana_kirim.create', 'rencana_kirim.edit',
            'gate.view', 'gate.create',
            'sj_validation.view', 'sj_validation.create', 'sj_validation.validate', 'sj_validation.complete',
            'receiving.view', 'receiving.create', 'receiving.edit',
            'opname.view', 'opname.create', 'opname.edit',
            'npn.view',
        ] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->planner = User::create([
            'email' => 'e2e-planner@test.com',
            'password' => 'password',
            'full_name' => 'E2E Planner',
            'kode_depo' => 'DPO-01',
            'nama_depo' => 'Depo Pusat',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $this->checker = User::create([
            'email' => 'e2e-checker@test.com',
            'password' => 'password',
            'full_name' => 'E2E Checker',
            'kode_depo' => 'DPO-01',
            'nama_depo' => 'Depo Pusat',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach([$this->planner->id, $this->checker->id]);

        Npn::create([
            'szNickName' => 'Produk E2E Opname',
            'BOSnetszProductId' => 'B-E2E-OP',
            'SAPszProductId' => 'SAP-E2E-OP',
            'SAPszUomId' => 'CRT',
            'szBarcode' => 'BC-E2E-OP',
            'szStatus' => 'EXISTING',
        ]);
    }

    public function test_rencana_kirim_sampai_sesi_opname_selesai(): void
    {
        // 1. Rencana kirim DRAFT -> SCHEDULED.
        Sanctum::actingAs($this->planner);
        $npn = Npn::where('BOSnetszProductId', 'B-E2E-OP')->first();
        $rkId = $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'SJ-E2E-OP-01',
            'rkh_date' => '2026-09-09',
            'driver_name' => 'Supir E2E',
            'nopol' => 'B 1234 E2E',
            'jenis_kendaraan' => 'CDD',
            'expedisi' => 'Ekspedisi E2E',
            'shipper_name' => 'PT Pengirim E2E',
            'destination_name' => 'Depo Pusat',
            'kode_depo' => 'DPO-01',
            'nama_depo' => 'Depo Pusat',
            'items' => [[
                'item_number' => 1,
                'npn_id' => $npn->id,
                'kode_barang' => 'B-E2E-OP',
                'nama_barang' => 'Produk E2E Opname',
                'jumlah' => 10,
                'satuan' => 'CRT',
            ]],
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/rencana-kirim/{$rkId}/schedule")->assertOk();

        // 2. Gate IN.
        Sanctum::actingAs($this->checker);
        $this->postJson('/api/v1/gate-transactions', [
            'rencana_kirim_id' => $rkId,
            'gate_type' => 'INBOUND',
        ])->assertCreated();

        // 3. Validasi SJ: start + scan (expired dekat agar terpantau) + complete.
        $validationId = $this->postJson("/api/v1/sj-validations/start/{$rkId}")->assertOk()->json('data.id');
        $items = $this->getJson("/api/v1/sj-validations/{$validationId}")->json('data.items');
        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $items[0]['id'],
            'actual_qty' => 10,
            'condition' => 'FISIK_BAGUS',
            'expired_date' => '2026-09-20',
        ])->assertOk();
        $this->postJson("/api/v1/sj-validations/{$validationId}/complete")->assertOk();

        // Label SJ terbit — awal rantai identitas.
        $sjBatch = Batch::where('sj_validation_item_id', $items[0]['id'])->first();
        $this->assertNotNull($sjBatch);

        // 4. Receiving terbentuk dari validasi.
        $receiving = Receiving::where('rencana_kirim_id', $rkId)->first();
        $this->assertNotNull($receiving);
        $ri = ReceivingItem::where('receiving_id', $receiving->id)->where('kode_barang', 'B-E2E-OP')->first();
        $this->assertNotNull($ri);
        $this->assertNotNull($ri->batch);
        $this->assertSame($sjBatch->id, $ri->batch->id);

        // 5. Generate opname: wave memuat batch SJ.
        app(OpnameExpiredService::class)->generate();
        $wave = OpnameExpiredWave::where('week_start', '2026-09-07')->where('kode_barang', 'B-E2E-OP')->first();
        $this->assertNotNull($wave);
        $this->assertContains($sjBatch->batch_number, $wave->batch_numbers ?? []);

        // 6. Sesi: buat -> mulai -> verifikasi -> selesai.
        Sanctum::actingAs($this->planner);
        $sessionId = $this->postJson('/api/v1/opname-sessions', [
            'week_start' => '2026-09-07',
            'kode_depo' => 'DPO-01',
            'nama_depo' => 'Depo Pusat',
            'assigned_to' => $this->checker->id,
            'wave_ids' => [$wave->id],
        ])->assertCreated()->json('data.id');

        $session = OpnameExpiredSession::find($sessionId);
        $this->assertCount(1, $session->items);
        $this->assertSame($sjBatch->id, (int) $session->items->first()->batch_id);

        Sanctum::actingAs($this->checker);
        $this->postJson("/api/v1/opname-sessions/{$sessionId}/start")->assertOk();
        $itemId = $session->items->first()->id;
        $verify = $this->postJson("/api/v1/opname-sessions/{$sessionId}/items/{$itemId}", [
            'qty_fisik_crt' => 9,
            'identified_via' => 'scan',
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();
        // Batch SJ sudah ada: tidak ada label ganda.
        $this->assertSame(0, $verify->json('data.batches_issued'));
        $this->postJson("/api/v1/opname-sessions/{$sessionId}/complete")->assertOk();

        // 7. Wave mencatat koreksi + validator; identitas utuh ujung-ke-ujung.
        $wave = $wave->fresh();
        $this->assertEquals(-1, (float) $wave->qty_koreksi_crt);
        $this->assertSame($this->checker->id, (int) $wave->validated_by);
        $this->assertSame('COMPLETED', $session->fresh()->status);

        // 8. Regresi: di produksi id baris penerimaan sudah jauh lebih besar
        // dari sj_validation_item_id. Relasi batch WAJIB memakai kolom
        // sj_validation_item_id sebagai local key, bukan receiving_items.id.
        // Baris baru di bawah sengaja punya id != sj_validation_item_id agar
        // kebetulan id yang menutupi bug (pada DB test yang masih sepi) hilang.
        $decoy = ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'sj_validation_item_id' => $items[0]['id'],
            'kode_barang' => 'B-E2E-OP',
            'nama_barang' => 'Produk E2E Opname',
            'source' => ReceivingItem::SOURCE_VALIDASI,
        ]);
        $this->assertNotSame((int) $decoy->sj_validation_item_id, (int) $decoy->id);
        $this->assertSame($sjBatch->id, $decoy->batch?->id);
    }

    public function test_receiving_complete_accepts_uppercase_scan_for_lowercase_po(): void
    {
        // Barcode cetak selalu UPPERCASE hasil sanitasi Code39; PO di
        // database boleh lowercase — scan harus tetap cocok.
        Sanctum::actingAs($this->planner);
        $rencana = RencanaKirim::create([
            'po_transporter' => 'sj-e2e-lower-01',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO-01',
            'nama_depo' => 'Depo Pusat',
            'created_by' => $this->planner->id,
        ]);
        $receiving = Receiving::create([
            'rencana_kirim_id' => $rencana->id,
            'status' => 'PENDING',
        ]);

        $this->postJson("/api/v1/receivings/{$receiving->id}/complete", [
            'barcode' => 'SJ-E2E-LOWER-01',
        ])->assertOk();

        $this->assertSame('COMPLETED', $receiving->fresh()->status);
    }
}
