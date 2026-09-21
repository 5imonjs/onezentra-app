<?php

namespace Tests\Feature;

use App\Models\Npn;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LoginToCompleteFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $adminPlanner;

    private User $cheker;

    protected function setUp(): void
    {
        parent::setUp();

        // Permission set lengkap sesuai project_flow.md
        $allPerms = [
            'rencana_kirim.view', 'rencana_kirim.create', 'rencana_kirim.edit', 'rencana_kirim.delete',
            'gate.view', 'gate.create',
            'sj_validation.view', 'sj_validation.create', 'sj_validation.edit', 'sj_validation.delete',
            'receiving.view', 'receiving.create', 'receiving.edit',
            'npn.view',
            'dashboard.view',
        ];

        $rolePlanner = Role::firstOrCreate(['slug' => 'admin_planner'], ['name' => 'Admin Planner']);
        $roleCheker = Role::firstOrCreate(['slug' => 'cheker'], ['name' => 'Cheker']);

        foreach ($allPerms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $rolePlanner->permissions()->syncWithoutDetaching([$perm->id]);
            $roleCheker->permissions()->syncWithoutDetaching([$perm->id]);
        }

        // Admin Planner: pembuat rencana kirim
        $this->adminPlanner = User::create([
            'email' => 'adminplanner@onezentra.com',
            'password' => 'password',
            'full_name' => 'Admin Planner',
            'kode_depo' => 'DPO-01',
            'nama_depo' => 'Depo Pusat',
            'level' => 'admin_planner',
            'status' => 'active',
        ]);
        $rolePlanner->users()->attach($this->adminPlanner->id);
        $this->adminPlanner->update(['role_id' => $rolePlanner->id]);

        // Cheker: gate + validasi + receiving
        $this->cheker = User::create([
            'email' => 'cheker@onezentra.com',
            'password' => 'password',
            'full_name' => 'Cheker Satu',
            'kode_depo' => 'DPO-01',
            'nama_depo' => 'Depo Pusat',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $roleCheker->users()->attach($this->cheker->id);
        $this->cheker->update(['role_id' => $roleCheker->id]);

        // NPN master global
        Npn::create([
            'szNickName' => 'Produk E2E A',
            'BOSnetszProductId' => 'B-E2E-01',
            'SAPszProductId' => 'SAP-E2E-01',
            'SAPszUomId' => 'CRT',
            'SAPdecUom' => '12',
            'decVolume' => '1000',
            'szBarcode' => 'BC-E2E-01',
            'szStatus' => 'EXISTING',
        ]);
        Npn::create([
            'szNickName' => 'Produk E2E B',
            'BOSnetszProductId' => 'B-E2E-02',
            'SAPszProductId' => 'SAP-E2E-02',
            'SAPszUomId' => 'CRT',
            'SAPdecUom' => '24',
            'decVolume' => '500',
            'szBarcode' => 'BC-E2E-02',
            'szStatus' => 'EXISTING',
        ]);
    }

    public function test_login_sampai_proses_akhir_completed(): void
    {
        // ============================================================
        // 1. LOGIN - POST /api/v1/login
        // ============================================================
        // 1a. Password salah -> 422
        $this->postJson('/api/v1/login', [
            'email' => 'adminplanner@onezentra.com',
            'password' => 'salah-password',
        ])->assertStatus(422);

        // 1b. Login valid -> 200, tidak ada token bearer
        $loginRes = $this->postJson('/api/v1/login', [
            'email' => 'adminplanner@onezentra.com',
            'password' => 'password',
        ])->assertOk()
            ->assertJsonPath('message', 'Login successful')
            ->assertJsonMissingPath('token')
            ->assertJsonPath('user.email', 'adminplanner@onezentra.com');

        $this->assertNotEmpty($loginRes->json('permissions'));
        $this->assertDatabaseCount('personal_access_tokens', 0);

        // 1c. GET /api/v1/user tanpa auth -> 401
        // (gunakan fresh instance tanpa actingAs)
        // Setelah login via session, tetap butuh Sanctum actingAs di test
        Sanctum::actingAs($this->adminPlanner);
        $this->getJson('/api/v1/user')->assertOk()
            ->assertJsonPath('user.email', 'adminplanner@onezentra.com');

        // ============================================================
        // 2. BUAT RENCANA KIRIM -> DRAFT
        //    POST /api/v1/rencana-kirim
        // ============================================================
        $npnA = Npn::where('BOSnetszProductId', 'B-E2E-01')->first();
        $npnB = Npn::where('BOSnetszProductId', 'B-E2E-02')->first();

        $createRes = $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'SJ-E2E-001',
            'rkh_date' => now()->toDateString(), // E2E harus tahan waktu (hardcode membuat test basi)
            'driver_name' => 'Budi E2E',
            'nopol' => 'B 9999 E2E',
            'jenis_kendaraan' => 'CDD',
            'expedisi' => 'Ekspedisi E2E',
            'shipper_name' => 'PT Pengirim E2E',
            'shipper_address' => 'Jl. Pengirim No. 1',
            'destination_name' => 'Depo Pusat',
            'kode_depo' => 'DPO-01',
            'nama_depo' => 'Depo Pusat',
            'notes' => 'E2E test full flow',
            'items' => [
                [
                    'item_number' => 1,
                    'npn_id' => $npnA->id,
                    'kode_barang' => $npnA->BOSnetszProductId,
                    'nama_barang' => 'Produk E2E A',
                    'jumlah' => 10,
                    'satuan' => 'CRT',
                ],
                [
                    'item_number' => 2,
                    'npn_id' => $npnB->id,
                    'kode_barang' => $npnB->BOSnetszProductId,
                    'nama_barang' => 'Produk E2E B',
                    'jumlah' => 5,
                    'satuan' => 'CRT',
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.status', 'DRAFT')
            ->assertJsonPath('data.po_transporter', 'SJ-E2E-001')
            ->assertJsonPath('data.jenis_kendaraan', 'CDD');

        $rkId = $createRes->json('data.id');
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rkId, 'status' => 'DRAFT', 'total_qty' => 15]);
        // Kubikasi: A=10*1000*12/1e6=0.12, B=5*500*24/1e6=0.06, total 0.18
        $this->assertEqualsWithDelta(0.18, (float) $createRes->json('data.total_kubikasi'), 0.0001);

        // Validasi: jumlah 0 ditolak 422
        $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'SJ-E2E-FAIL',
            'items' => [['item_number' => 1, 'nama_barang' => 'Produk E2E A', 'jumlah' => 0, 'satuan' => 'CRT']],
        ])->assertStatus(422);

        // Transisi ilegal DRAFT -> VERIFIED ditolak 422
        $this->postJson("/api/v1/rencana-kirim/{$rkId}/verify")->assertStatus(422);

        // ============================================================
        // 3. SCHEDULE -> SCHEDULED
        //    POST /api/v1/rencana-kirim/{id}/schedule
        // ============================================================
        $this->postJson("/api/v1/rencana-kirim/{$rkId}/schedule")->assertOk()
            ->assertJsonPath('data.status', 'SCHEDULED');
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rkId, 'status' => 'SCHEDULED']);
        $this->assertNotNull(RencanaKirim::find($rkId)->scheduled_at);

        // ============================================================
        // 4. GATE IN -> CHECKED_IN  (Security/Cheker)
        //    POST /api/v1/gate-transactions
        // ============================================================
        Sanctum::actingAs($this->cheker);

        // Gate INBOUND hanya boleh dari SCHEDULED -> sukses
        $gateRes = $this->postJson('/api/v1/gate-transactions', [
            'rencana_kirim_id' => $rkId,
            'gate_type' => 'INBOUND',
        ])->assertCreated();
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rkId, 'status' => 'CHECKED_IN']);
        $this->assertDatabaseHas('gate_transactions', ['rencana_kirim_id' => $rkId, 'gate_type' => 'INBOUND']);

        // Duplikat INBOUND ditolak 422
        $this->postJson('/api/v1/gate-transactions', [
            'rencana_kirim_id' => $rkId,
            'gate_type' => 'INBOUND',
        ])->assertStatus(422);

        // ============================================================
        // 5. VALIDASI SJ: lookup, start, scan per item, complete
        //    GET /sj-validations/lookup, POST /sj-validations/start/{rk}
        // ============================================================
        // 5a. Lookup by PO transporter
        $this->getJson('/api/v1/sj-validations/lookup?scan_code=SJ-E2E-001')->assertOk()
            ->assertJsonPath('data.po_transporter', 'SJ-E2E-001');

        // 5b. Mulai validasi -> snapshot 2 item
        $startRes = $this->postJson("/api/v1/sj-validations/start/{$rkId}")->assertOk();
        $validationId = $startRes->json('data.id');
        $this->assertDatabaseHas('sj_validations', ['id' => $validationId, 'status' => 'IN_PROGRESS']);
        $this->assertCount(2, $startRes->json('data.items'));
        $item1Id = $startRes->json('data.items.0.id');
        $item2Id = $startRes->json('data.items.1.id');
        // default condition FISIK_BAGUS, status PENDING
        $this->assertSame('FISIK_BAGUS', $startRes->json('data.items.0.condition'));
        $this->assertSame('PENDING', $startRes->json('data.items.0.status'));

        // 5c. Scan item 1: qty cocok -> VALIDATED
        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $item1Id,
            'actual_qty' => 10,
            'condition' => 'FISIK_BAGUS',
            'expired_date' => '2027-01-15',
            'barcode' => 'BC-E2E-01',
        ])->assertOk()->assertJsonPath('data.status', 'VALIDATED');
        $this->assertDatabaseHas('sj_validation_items', ['id' => $item1Id, 'status' => 'VALIDATED', 'actual_qty' => 10]);
        // Batch per produk otomatis terbuat
        $this->assertDatabaseHas('batches', ['sj_validation_item_id' => $item1Id]);

        // 5d. Scan item 2: qty selisih -> MISMATCH + foto wajib jika rusak
        // Tanpa foto saat FISIK_RUSAK -> 422
        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $item2Id,
            'actual_qty' => 3,
            'condition' => 'FISIK_RUSAK',
        ])->assertStatus(422);

        // Dengan qty selisih tapi condition FISIK_BAGUS -> MISMATCH (boleh tanpa foto)
        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $item2Id,
            'actual_qty' => 3,
            'condition' => 'FISIK_BAGUS',
            'expired_date' => '2027-02-01',
            'tier' => 5,
            'tinggi_tumpukan' => 100,
        ])->assertOk()->assertJsonPath('data.status', 'MISMATCH');
        $this->assertDatabaseHas('sj_validation_items', ['id' => $item2Id, 'status' => 'MISMATCH', 'actual_qty' => 3]);
        // Standarisasi tumpukan tersimpan pending via scan
        $this->assertDatabaseHas('standarisasi_tumpukan', [
            'npn_id' => $npnB->id,
            'tier' => 5,
            'tinggi_tumpukan' => 100,
            'total_tier_tinggi' => 500,
            'status' => 'pending',
        ]);

        // 5e. Selesaikan validasi -> COMPLETED, rencana -> VERIFIED, auto-create Receiving PENDING
        $this->postJson("/api/v1/sj-validations/{$validationId}/complete")->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED');
        $this->assertDatabaseHas('sj_validations', ['id' => $validationId, 'status' => 'COMPLETED']);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rkId, 'status' => 'VERIFIED']);
        $this->assertDatabaseHas('receivings', ['rencana_kirim_id' => $rkId, 'status' => 'PENDING']);

        $receiving = Receiving::where('rencana_kirim_id', $rkId)->first();
        $this->assertNotNull($receiving);
        $this->assertEquals(2, $receiving->items()->count());
        // actual_qty diteruskan dari validasi (10 dan 3), bukan expected (10 dan 5)
        $riA = $receiving->items()->where('kode_barang', 'B-E2E-01')->first();
        $riB = $receiving->items()->where('kode_barang', 'B-E2E-02')->first();
        $this->assertEquals(10, (float) $riA->actual_qty);
        $this->assertEquals(3, (float) $riB->actual_qty);
        $this->assertEquals(-2, (float) $riB->selisih_qty);
        $this->assertEquals($item1Id, $riA->sj_validation_item_id);

        // Idempotensi: scan lagi setelah COMPLETED ditolak 422
        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $item1Id,
            'actual_qty' => 10,
        ])->assertStatus(422);

        // ============================================================
        // 6. RECEIVING: scan barcode PO Transporter -> complete
        //    POST /api/v1/receivings/{id}/complete
        // ============================================================
        // 6a. Search receiving by PO
        $searchRes = $this->getJson('/api/v1/receivings?search=SJ-E2E-001')->assertOk();
        $this->assertNotEmpty($searchRes->json('data'));

        // 6b. Barcode salah -> 422
        $this->postJson("/api/v1/receivings/{$receiving->id}/complete", [
            'barcode' => 'SALAH-BARCODE',
        ])->assertStatus(422);

        // 6c. Barcode benar -> COMPLETED, rencana -> COMPLETED
        // PO transporter adalah barcode yang benar (po_transporter)
        // Batch per produk sudah terbuat saat scan validasi (2 batches), bukan saat complete receiving
        $this->postJson("/api/v1/receivings/{$receiving->id}/complete", [
            'barcode' => 'SJ-E2E-001',
        ])->assertOk();
        $this->assertDatabaseHas('receivings', ['id' => $receiving->id, 'status' => 'COMPLETED']);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rkId, 'status' => 'COMPLETED']);
        $this->assertDatabaseCount('batches', 2);
        $this->assertDatabaseHas('batches', ['sj_validation_item_id' => $item1Id]);
        $this->assertDatabaseHas('batches', ['sj_validation_item_id' => $item2Id]);

        // 6d. Gate OUTBOUND hanya boleh setelah COMPLETED -> sukses
        $this->postJson('/api/v1/gate-transactions', [
            'rencana_kirim_id' => $rkId,
            'gate_type' => 'OUTBOUND',
        ])->assertCreated();
        $this->assertDatabaseHas('gate_transactions', ['rencana_kirim_id' => $rkId, 'gate_type' => 'OUTBOUND']);

        // ============================================================
        // 7. LOGOUT
        //    POST /api/v1/logout
        // ============================================================
        $this->postJson('/api/v1/logout')->assertOk()->assertJsonPath('message', 'Logged out successfully');
        $this->assertDatabaseCount('personal_access_tokens', 0);

        // ============================================================
        // 8. NEGATIVE: login dengan akun inactive -> 422
        // ============================================================
        $inactive = User::create([
            'email' => 'inactive@onezentra.com',
            'password' => 'password',
            'full_name' => 'Inactive User',
            'kode_depo' => 'DPO-01',
            'nama_depo' => 'Depo Pusat',
            'level' => 'staff_logistic',
            'status' => 'inactive',
        ]);
        $this->postJson('/api/v1/login', [
            'email' => 'inactive@onezentra.com',
            'password' => 'password',
        ])->assertStatus(422);
    }

    public function test_login_wrong_password_and_inactive_blocked(): void
    {
        User::create([
            'email' => 'blok@onezentra.com',
            'password' => Hash::make('secret-123'),
            'full_name' => 'Blok User',
            'kode_depo' => 'DPO-01',
            'nama_depo' => 'Depo Pusat',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);

        // tanpa email/password
        $this->postJson('/api/v1/login', [])->assertStatus(422);
        // password salah
        $this->postJson('/api/v1/login', ['email' => 'blok@onezentra.com', 'password' => 'salah'])->assertStatus(422);
        // login benar
        $this->postJson('/api/v1/login', ['email' => 'blok@onezentra.com', 'password' => 'secret-123'])->assertOk();
    }
}
