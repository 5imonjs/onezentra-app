<?php

namespace Tests\Feature;

use App\Mail\StandarisasiStatusNotification;
use App\Models\Npn;
use App\Models\OpnameExpiredWave;
use App\Models\Penerimaan;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\Role;
use App\Models\StandarisasiTumpukan;
use App\Models\User;
use App\Models\UserActivityLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * End-to-end coverage untuk semua flow yang disebut di request:
 * login, rencana_kirim, receiving, penerimaan, opname expired, laporan,
 * role & permission, setting email, email tujuan (recipients), tes kirim email.
 *
 * Struktur file tunggal dengan banyak method agar satu `php artisan test`
 * menguji seluruh sistem tanpa perlu run manual.
 */
class SystemEndToEndTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Role $roleAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();

        // Permission set superset agar semua endpoint bisa diakses
        $perms = [
            'rencana_kirim.view', 'rencana_kirim.create', 'rencana_kirim.edit', 'rencana_kirim.delete',
            'gate.view', 'gate.create',
            'sj_validation.view', 'sj_validation.create', 'sj_validation.edit', 'sj_validation.delete',
            'receiving.view', 'receiving.create', 'receiving.edit', 'receiving.delete',
            'penerimaan.view', 'penerimaan.create', 'penerimaan.edit', 'penerimaan.delete',
            'npn.view', 'npn.create', 'npn.edit', 'npn.delete',
            'roles.view', 'roles.create', 'roles.edit', 'roles.delete',
            'users.view', 'users.create', 'users.edit', 'users.delete',
            'emails.view', 'emails.edit',
            'opname.view', 'opname.create', 'opname.edit',
            'reports.view',
            'dashboard.view',
            'depot.view_all',
            'standarisasi.view', 'standarisasi.create', 'standarisasi.edit', 'standarisasi.delete',
        ];

        $this->roleAdmin = Role::firstOrCreate(['slug' => 'admin'], ['name' => 'Admin Master']);
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $this->roleAdmin->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->admin = User::create([
            'email' => 'admin@onezentra.com',
            'password' => 'password',
            'full_name' => 'Admin Master',
            'kode_depo' => 'ADMIN',
            'nama_depo' => 'Kantor Pusat',
            'level' => 'admin_master',
            'status' => 'active',
            'role_id' => $this->roleAdmin->id,
        ]);
        $this->roleAdmin->users()->attach($this->admin->id);

        Sanctum::actingAs($this->admin);
    }

    // ============================================================
    // 1. LOGIN  (AuthController.php:51)
    // ============================================================
    public function test_login_flow_valid_invalid_inactive(): void
    {
        Sanctum::actingAs($this->admin); // reset guard terlebih dahulu

        // tanpa kredensial -> 422
        $this->postJson('/api/v1/login', [])->assertStatus(422);

        // password salah -> 422
        $this->postJson('/api/v1/login', [
            'email' => 'admin@onezentra.com',
            'password' => 'wrong',
        ])->assertStatus(422);

        // login valid -> 200 tanpa Bearer token (AuthTest.php:28)
        $res = $this->postJson('/api/v1/login', [
            'email' => 'admin@onezentra.com',
            'password' => 'password',
        ])->assertOk()->assertJsonPath('message', 'Login successful');
        $res->assertJsonMissingPath('token');
        $this->assertNotEmpty($res->json('permissions'));

        // user inactive -> 422 (AuthController.php:66)
        $inactive = User::create([
            'email' => 'inactive@onezentra.com',
            'password' => 'password',
            'full_name' => 'Inactive',
            'kode_depo' => 'ADMIN',
            'nama_depo' => 'Kantor Pusat',
            'level' => 'operator',
            'status' => 'inactive',
        ]);
        $this->postJson('/api/v1/login', [
            'email' => 'inactive@onezentra.com',
            'password' => 'password',
        ])->assertStatus(422);

        // GET /user butuh auth
        $this->getJson('/api/v1/user')->assertOk()->assertJsonPath('user.email', 'admin@onezentra.com');

        // logout tidak error TransientToken (AuthTest.php:13)
        $this->postJson('/api/v1/logout')->assertOk()->assertJsonPath('message', 'Logged out successfully');
        Sanctum::actingAs($this->admin); // re-auth untuk test berikutnya
    }

    // ============================================================
    // 2. RENCANA KIRIM  (RencanaKirimController.php:164)
    //    DRAFT -> SCHEDULED -> (gate) CHECKED_IN -> VERIFIED -> COMPLETED
    // ============================================================
    public function test_rencana_kirim_full_state_machine(): void
    {
        $npn = Npn::create(['szNickName' => 'Produk RK', 'BOSnetszProductId' => 'B-RK-01', 'SAPszProductId' => 'SAP-RK-01', 'SAPszUomId' => 'CRT', 'SAPdecUom' => '10', 'decVolume' => '100', 'szStatus' => 'EXISTING']);

        // create DRAFT
        $res = $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'SJ-RK-001',
            'driver_name' => 'Driver RK',
            'nopol' => 'B 1 RK',
            'jenis_kendaraan' => 'FUSO',
            'items' => [['item_number' => 1, 'npn_id' => $npn->id, 'kode_barang' => $npn->BOSnetszProductId, 'nama_barang' => 'Produk RK', 'jumlah' => 10, 'satuan' => 'CRT']],
        ])->assertCreated()->assertJsonPath('data.status', 'DRAFT');
        $rkId = $res->json('data.id');

        // kubikasi = 10*100*10/1e6 = 0.01
        $this->assertEqualsWithDelta(0.01, (float) $res->json('data.total_kubikasi'), 0.0001);

        // index filter search + status
        $this->getJson('/api/v1/rencana-kirim?search=SJ-RK-001&status=DRAFT')->assertOk()->assertJsonCount(1, 'data');

        // transisi ilegal DRAFT->VERIFIED ditolak
        $this->postJson("/api/v1/rencana-kirim/{$rkId}/verify")->assertStatus(422);

        // SCHEDULED
        $this->postJson("/api/v1/rencana-kirim/{$rkId}/schedule")->assertOk()->assertJsonPath('data.status', 'SCHEDULED');
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rkId, 'status' => 'SCHEDULED']);

        // detail includes items.npn & kubikasi
        $this->getJson("/api/v1/rencana-kirim/{$rkId}")->assertOk()->assertJsonPath('data.po_transporter', 'SJ-RK-001');

        // update ganti items & jenis_kendaraan
        $this->putJson("/api/v1/rencana-kirim/{$rkId}", [
            'jenis_kendaraan' => 'TRONTON',
            'items' => [['item_number' => 1, 'npn_id' => $npn->id, 'kode_barang' => $npn->BOSnetszProductId, 'nama_barang' => 'Produk RK', 'jumlah' => 5, 'satuan' => 'CRT']],
        ])->assertOk()->assertJsonPath('data.jenis_kendaraan', 'TRONTON');

        // cancel dari SCHEDULED
        $rk2 = RencanaKirim::create(['po_transporter' => 'SJ-RK-002', 'kode_depo' => 'ADMIN', 'nama_depo' => 'Kantor Pusat', 'status' => 'DRAFT', 'created_by' => $this->admin->id]);
        $this->postJson("/api/v1/rencana-kirim/{$rk2->id}/schedule")->assertOk();
        $this->postJson("/api/v1/rencana-kirim/{$rk2->id}/cancel")->assertOk()->assertJsonPath('data.status', 'CANCELLED');

        // delete hanya DRAFT/CANCELLED
        $this->deleteJson("/api/v1/rencana-kirim/{$rk2->id}")->assertOk();
        // SCHEDULED bisa di-cancel -> CANCELLED, lalu bisa dihapus (TRANSITIONS DRAFT->SCHEDULED->CANCELLED)
        $this->postJson("/api/v1/rencana-kirim/{$rkId}/cancel")->assertOk()->assertJsonPath('data.status', 'CANCELLED');
        $this->deleteJson("/api/v1/rencana-kirim/{$rkId}")->assertOk();
    }

    // ============================================================
    // 3. RECEIVING  (ReceivingController.php:50) via auto-create dari validasi SJ
    // ============================================================
    public function test_receiving_gate_validasi_sampai_complete(): void
    {
        $npn = Npn::create(['szNickName' => 'Produk RCV', 'BOSnetszProductId' => 'B-RCV-01', 'szBarcode' => 'BC-RCV-01', 'szStatus' => 'EXISTING']);
        $rk = RencanaKirim::create(['po_transporter' => 'SJ-RCV-001', 'kode_depo' => 'ADMIN', 'nama_depo' => 'Kantor Pusat', 'driver_name' => 'Driver RCV', 'nopol' => 'B 2 RCV', 'status' => 'DRAFT', 'created_by' => $this->admin->id]);
        RencanaKirimItem::create(['rencana_kirim_id' => $rk->id, 'npn_id' => $npn->id, 'item_number' => 1, 'kode_barang' => 'B-RCV-01', 'nama_barang' => 'Produk RCV', 'jumlah' => 10, 'satuan' => 'CRT']);

        $this->postJson("/api/v1/rencana-kirim/{$rk->id}/schedule")->assertOk();
        $this->postJson('/api/v1/gate-transactions', ['rencana_kirim_id' => $rk->id, 'gate_type' => 'INBOUND'])->assertCreated();
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'CHECKED_IN']);

        // gate duplikat ditolak
        $this->postJson('/api/v1/gate-transactions', ['rencana_kirim_id' => $rk->id, 'gate_type' => 'INBOUND'])->assertStatus(422);

        // validasi SJ
        $start = $this->postJson("/api/v1/sj-validations/start/{$rk->id}")->assertOk();
        $vid = $start->json('data.id');
        $itemId = $start->json('data.items.0.id');

        $this->postJson("/api/v1/sj-validations/{$vid}/scan", [
            'sj_validation_item_id' => $itemId, 'actual_qty' => 8, 'condition' => 'FISIK_BAGUS',
        ])->assertOk()->assertJsonPath('data.status', 'MISMATCH'); // 8 != 10

        $this->postJson("/api/v1/sj-validations/{$vid}/complete")->assertOk();
        $this->assertDatabaseHas('receivings', ['rencana_kirim_id' => $rk->id, 'status' => 'PENDING']);

        $receiving = Receiving::where('rencana_kirim_id', $rk->id)->first();
        $this->assertEquals(8, (float) $receiving->items()->first()->actual_qty);
        $this->assertEquals(-2, (float) $receiving->items()->first()->selisih_qty);

        // complete receiving butuh barcode cocok (ReceivingController.php:330)
        $this->postJson("/api/v1/receivings/{$receiving->id}/complete", ['barcode' => 'SALAH'])->assertStatus(422);
        $this->postJson("/api/v1/receivings/{$receiving->id}/complete", ['barcode' => 'SJ-RCV-001'])->assertOk();
        $this->assertDatabaseHas('receivings', ['id' => $receiving->id, 'status' => 'COMPLETED']);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'COMPLETED']);

        // OUTBOUND hanya setelah COMPLETED
        $this->postJson('/api/v1/gate-transactions', ['rencana_kirim_id' => $rk->id, 'gate_type' => 'OUTBOUND'])->assertCreated();

        // index search
        $this->getJson('/api/v1/receivings?search=SJ-RCV-001')->assertOk();
        $this->getJson('/api/v1/gate-transactions')->assertOk();
    }

    // ============================================================
    // 4. PENERIMAAN  (PenerimaanController.php:11) - master data stok NPN per depo
    // ============================================================
    public function test_penerimaan_crud_dan_depot_scope(): void
    {
        // create draft (PenerimaanController.php:41)
        $res = $this->postJson('/api/v1/penerimaan', [
            'BOSnetszProductId' => 'B-PIM-01',
            'szNickName' => 'Penerimaan Produk A',
            'DO_QTY' => 100,
            'tanggal_penerimaan' => '2026-09-10',
            'kode_depo' => 'ADMIN',
            'nama_depo' => 'Kantor Pusat',
        ])->assertCreated()->assertJsonPath('data.BOSnetszProductId', 'B-PIM-01');
        $id = $res->json('data.id');
        $this->assertDatabaseHas('penerimaan', ['id' => $id, 'status' => 'draft']);

        // index + search + filter status
        $this->getJson('/api/v1/penerimaan?search=Penerimaan Produk A')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/penerimaan?status=draft')->assertOk();
        $this->getJson('/api/v1/penerimaan?tanggal_from=2026-09-01&tanggal_to=2026-09-30')->assertOk();

        // show
        $this->getJson("/api/v1/penerimaan/{$id}")->assertOk()->assertJsonPath('data.szNickName', 'Penerimaan Produk A');

        // update -> completed (PenerimaanController.php:115 sets completed_at) - DO_QTY cast decimal:2 jadi 120.00
        $this->putJson("/api/v1/penerimaan/{$id}", ['status' => 'completed', 'DO_QTY' => 120])->assertOk();
        $this->assertEquals(120, (float) Penerimaan::find($id)->DO_QTY);
        $this->assertNotNull(Penerimaan::find($id)->completed_at);

        // depot scoping: user depo lain tidak bisa akses detail
        $otherRole = Role::firstOrCreate(['slug' => 'cheker_pim'], ['name' => 'Cheker PIM']);
        $perm = Permission::where('slug', 'penerimaan.view')->first();
        $otherRole->permissions()->syncWithoutDetaching([$perm->id]);
        $otherUser = User::create(['email' => 'other@pim.test', 'password' => 'password', 'full_name' => 'Other', 'kode_depo' => 'DEPO-X', 'nama_depo' => 'Depo X', 'level' => 'operator', 'status' => 'active', 'role_id' => $otherRole->id]);
        $otherRole->users()->attach($otherUser->id);
        Sanctum::actingAs($otherUser);
        $this->getJson("/api/v1/penerimaan/{$id}")->assertForbidden();

        Sanctum::actingAs($this->admin);
        // delete
        $this->deleteJson("/api/v1/penerimaan/{$id}")->assertOk();
        $this->assertDatabaseMissing('penerimaan', ['id' => $id]);
    }

    // ============================================================
    // 5. OPNAME EXPIRED  (OpnameExpiredController.php:16)
    // ============================================================
    public function test_opname_expired_full_flow(): void
    {
        $this->travelTo('2026-09-09 10:00:00');

        // manual import receiving item sebagai sumber opname
        Npn::create(['BOSnetszProductId' => 'B-OPN-01', 'SAPszProductId' => 'SAP-OPN-01', 'szNickName' => 'Produk Opname', 'decUomConversion1' => 10, 'szStatus' => 'EXISTING']);
        $this->postJson('/api/v1/receiving-items', [
            'kode_barang' => 'B-OPN-01', 'qty_crt' => 5, 'qty_pcs' => 50, 'expired_date' => '2027-06-01', 'tanggal_penerimaan' => '2026-09-09', 'sumber_material' => 'PT Opname',
        ])->assertCreated()->assertJsonPath('data.source', 'IMPORT_MANUAL');

        // generate wave (OpnameExpiredController.php:89 / Service)
        $genRes = $this->postJson('/api/v1/opname-expired/generate')->assertOk();
        $this->assertSame('2026-09-07', $genRes->json('data.week_start'));
        $this->assertDatabaseHas('opname_expired_waves', ['kode_barang' => 'B-OPN-01', 'week_start' => '2026-09-07']);

        // index dengan status_summary & depot_summary
        $this->getJson('/api/v1/opname-expired')->assertOk()
            ->assertJsonPath('meta.status_summary.AMAN.count', 1)
            ->assertJsonPath('meta.thresholds.threshold_aman', 90);

        // settings
        $this->getJson('/api/v1/opname-expired/settings')->assertOk()->assertJsonPath('data.threshold_aman', 90);
        $this->putJson('/api/v1/opname-expired/settings', ['threshold_aman' => 60, 'threshold_perhatian' => 20, 'threshold_kritis' => 5])->assertOk()->assertJsonPath('data.threshold_aman', 60);
        // reset
        $this->putJson('/api/v1/opname-expired/settings', ['threshold_aman' => 90, 'threshold_perhatian' => 30, 'threshold_kritis' => 7])->assertOk();

        // update wave koreksi
        $wave = OpnameExpiredWave::where('kode_barang', 'B-OPN-01')->first();
        $this->putJson("/api/v1/opname-expired/{$wave->id}", [
            'qty_koreksi_crt' => -1,
        ])->assertOk();

        // show single wave
        $this->getJson("/api/v1/opname-expired/{$wave->id}")->assertOk()->assertJsonPath('data.kode_barang', 'B-OPN-01');

        // export returns xlsx
        $this->get('/api/v1/opname-expired/export')->assertOk()->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    // ============================================================
    // 6. LAPORAN  (ReportController.php:15)
    // ============================================================
    public function test_laporan_selisih_dan_penerimaan(): void
    {
        // siapkan receiving_items dengan selisih
        $rk = RencanaKirim::create(['po_transporter' => 'SJ-LAP-01', 'kode_depo' => 'ADMIN', 'nama_depo' => 'Kantor Pusat', 'status' => 'COMPLETED', 'created_by' => $this->admin->id]);
        $rcv = Receiving::create(['rencana_kirim_id' => $rk->id, 'status' => 'COMPLETED', 'checked_by' => $this->admin->id]);
        ReceivingItem::create(['receiving_id' => $rcv->id, 'source' => 'VALIDASI_SJ', 'kode_barang' => 'B-LAP-01', 'nama_barang' => 'Barang Lap', 'expected_qty' => 10, 'actual_qty' => 8, 'selisih_qty' => -2, 'satuan' => 'CRT', 'tanggal_penerimaan' => '2026-09-09', 'kode_depo' => 'ADMIN', 'nama_depo' => 'Kantor Pusat', 'expired_date' => '2027-01-01', 'qty_pcs' => 80, 'sumber_material' => 'PT Lap']);
        ReceivingItem::create(['receiving_id' => $rcv->id, 'source' => 'IMPORT_MANUAL', 'kode_barang' => 'B-LAP-02', 'nama_barang' => 'Barang Manual', 'expected_qty' => 5, 'actual_qty' => 5, 'selisih_qty' => 0, 'satuan' => 'CRT', 'tanggal_penerimaan' => '2026-09-09', 'kode_depo' => 'ADMIN', 'nama_depo' => 'Kantor Pusat', 'expired_date' => '2027-01-01', 'qty_pcs' => 50, 'sumber_material' => 'PT Lap']);

        // selisih-qty report hanya item selisih !=0
        $this->getJson('/api/v1/reports/selisih-qty')->assertOk()
            ->assertJsonPath('summary.total_item', 1)
            ->assertJsonPath('summary.total_selisih', -2)
            ->assertJsonPath('data.0.kode_barang', 'B-LAP-01');
        $this->getJson('/api/v1/reports/selisih-qty?kode_depo=ADMIN')->assertOk();
        $this->get('/api/v1/reports/selisih-qty/export')->assertOk()->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // penerimaan report (PenerimaanReportTest.php:61)
        $this->getJson('/api/v1/reports/penerimaan')->assertOk()->assertJsonPath('summary.total_item', 2);
        $this->getJson('/api/v1/reports/penerimaan?sumber=VALIDASI_SJ')->assertOk()->assertJsonPath('summary.total_item', 1);
        $this->getJson('/api/v1/reports/penerimaan?search=B-LAP-01')->assertOk()->assertJsonPath('summary.total_item', 1);
        $this->getJson('/api/v1/reports/penerimaan?tanggal_from=2026-09-01&tanggal_to=2026-09-30')->assertOk()->assertJsonPath('summary.total_item', 2);
        $this->get('/api/v1/reports/penerimaan/export')->assertOk()->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    // ============================================================
    // 7. ROLE & PERMISSION  (RoleController.php / PermissionController.php)
    // ============================================================
    public function test_role_permission_full_crud_dan_sync(): void
    {
        // permissions index
        $this->getJson('/api/v1/permissions')->assertOk()->assertJsonStructure(['data', 'groups']);
        // create permission
        $permRes = $this->postJson('/api/v1/permissions', ['name' => 'Tes Perm', 'slug' => 'tes.perm', 'menu_group' => 'TestGroup'])->assertCreated()->assertJsonPath('data.slug', 'tes.perm');
        $permId = $permRes->json('data.id');
        $this->getJson("/api/v1/permissions/{$permId}")->assertOk();
        $this->putJson("/api/v1/permissions/{$permId}", ['name' => 'Tes Perm Updated'])->assertOk()->assertJsonPath('data.name', 'Tes Perm Updated');

        // roles index
        $this->getJson('/api/v1/roles')->assertOk()->assertJsonStructure(['data', 'meta']);
        // create role
        $roleRes = $this->postJson('/api/v1/roles', ['name' => 'Role Baru', 'slug' => 'role_baru', 'description' => 'Deskripsi'])->assertCreated();
        $roleId = $roleRes->json('data.id');

        // getPermissions menunjukkan assigned true/false
        $this->getJson("/api/v1/roles/{$roleId}/permissions")->assertOk()->assertJsonPath('role.id', $roleId);

        // sync permissions
        $otherPerm = Permission::where('slug', 'rencana_kirim.view')->first();
        $this->putJson("/api/v1/roles/{$roleId}/permissions", ['permission_ids' => [$permId, $otherPerm->id]])->assertOk();
        $assigned = $this->getJson("/api/v1/roles/{$roleId}/permissions")->assertOk()->json('assignedIds');
        $this->assertContains($permId, $assigned);
        $this->assertContains($otherPerm->id, $assigned);

        // update role
        $this->putJson("/api/v1/roles/{$roleId}", ['description' => 'Deskripsi Baru'])->assertOk()->assertJsonPath('data.description', 'Deskripsi Baru');

        // tidak bisa deactivate role yang punya user (RoleControllerTest.php:40)
        $assigned = Role::firstOrCreate(['slug' => 'assigned_sync'], ['name' => 'Assigned Sync']);
        $assigned->users()->attach($this->admin->id);
        $this->putJson("/api/v1/roles/{$assigned->id}", ['is_active' => false])->assertStatus(422);

        // tidak bisa delete permission yang masih ter-assign (PermissionController.php:77)
        $this->deleteJson("/api/v1/permissions/{$permId}")->assertStatus(422); // masih ter-assign ke role_baru
        // lepas satu permission (sisakan otherPerm) baru bisa hapus permId
        $this->putJson("/api/v1/roles/{$roleId}/permissions", ['permission_ids' => [$otherPerm->id]])->assertOk();
        $this->deleteJson("/api/v1/permissions/{$permId}")->assertOk();

        // delete role tanpa user
        $this->deleteJson("/api/v1/roles/{$roleId}")->assertOk();
    }

    // ============================================================
    // 8. SETTING EMAIL + TES KIRIM EMAIL  (EmailSettingController.php:16)
    // ============================================================
    public function test_setting_email_dan_tes_kirim_email(): void
    {
        // show default
        $this->getJson('/api/v1/email-settings')->assertOk()->assertJsonPath('data.from_system_env', true);

        // update (password di-bcrypt, is_active=true, from_system_env=false)
        $this->putJson('/api/v1/email-settings', [
            'host' => 'smtp.example.com', 'port' => 587, 'username' => 'user@example.com', 'password' => 'secret123',
            'encryption' => 'tls', 'from_address' => 'noreply@onezentra.com', 'from_name' => 'ONEZENTRA',
            'from_system_env' => false, 'is_active' => true,
        ])->assertOk()->assertJsonPath('data.host', 'smtp.example.com');
        $this->assertDatabaseHas('email_settings', ['host' => 'smtp.example.com', 'is_active' => true]);

        // tes kirim email -> EmailSettingController::test pakai Mail::raw (MAIL_MAILER=log/array)
        // Dengan Mail::fake di setUp, response 200 sudah membuktikan service terpanggil tanpa 500
        $this->postJson('/api/v1/email-settings/test', ['to' => 'test@example.com'])->assertOk()->assertJsonPath('message', 'Email test sent');

        // validasi email test wajib
        $this->postJson('/api/v1/email-settings/test', ['to' => 'not-email'])->assertStatus(422);
    }

    // ============================================================
    // 9. EMAIL TUJUAN (Recipients)  (EmailRecipientController.php:14)
    // ============================================================
    public function test_email_tujuan_crud_dan_options(): void
    {
        // options mengembalikan document_types/triggers/fields/users/roles
        $opts = $this->getJson('/api/v1/email-recipients/options')->assertOk();
        $opts->assertJsonPath('document_types.0', 'rencana_kirim');
        $this->assertContains('selisih', $opts->json('document_types'));
        $this->assertContains('TO', $opts->json('fields'));

        // store email type TO
        $r1 = $this->postJson('/api/v1/email-recipients', [
            'document_type' => 'rencana_kirim', 'trigger' => 'created', 'recipient_type' => 'email', 'field' => 'TO', 'email' => 'to@example.com', 'label' => 'TO Rencana',
        ])->assertCreated()->assertJsonPath('data.email', 'to@example.com');
        $r1Id = $r1->json('data.id');

        // store role type CC (harus ada role)
        $role = Role::first();
        $this->postJson('/api/v1/email-recipients', [
            'document_type' => 'sj_ba', 'trigger' => 'validated', 'recipient_type' => 'role', 'field' => 'CC', 'role_slug' => $role->slug,
        ])->assertCreated()->assertJsonPath('data.role_slug', $role->slug);

        // store user type TO
        $this->postJson('/api/v1/email-recipients', [
            'document_type' => 'receiving', 'trigger' => 'completed', 'recipient_type' => 'user', 'field' => 'TO', 'user_id' => $this->admin->id,
        ])->assertCreated()->assertJsonPath('data.user_id', $this->admin->id);

        // store selisih trigger (PenerimaanReport -> email selisih_qty)
        $this->postJson('/api/v1/email-recipients', [
            'document_type' => 'selisih', 'trigger' => 'selisih_qty', 'recipient_type' => 'email', 'field' => 'TO', 'email' => 'selisih@example.com',
        ])->assertCreated();

        // validasi: recipient_type=email tanpa email -> 422
        $this->postJson('/api/v1/email-recipients', [
            'document_type' => 'rencana_kirim', 'trigger' => 'created', 'recipient_type' => 'email', 'field' => 'TO',
        ])->assertStatus(422);

        // index filter
        $this->getJson('/api/v1/email-recipients?document_type=rencana_kirim')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/email-recipients')->assertOk()->assertJsonCount(4, 'data');

        // update
        $this->putJson("/api/v1/email-recipients/{$r1Id}", [
            'document_type' => 'rencana_kirim', 'trigger' => 'created', 'recipient_type' => 'email', 'field' => 'CC', 'email' => 'cc@example.com',
        ])->assertOk()->assertJsonPath('data.field', 'CC');

        // destroy
        $this->deleteJson("/api/v1/email-recipients/{$r1Id}")->assertOk();
        $this->assertDatabaseMissing('email_recipients', ['id' => $r1Id]);
    }

    // ============================================================
    // 9b. EMAIL STANDARISASI (document_type=standarisasi_tumpukan)
    // ============================================================
    public function test_email_standarisasi_recipients_dan_notifikasi(): void
    {
        // options memuat jenis dokumen & trigger standarisasi
        $opts = $this->getJson('/api/v1/email-recipients/options')->assertOk();
        $this->assertContains('standarisasi_tumpukan', $opts->json('document_types'));
        $this->assertContains('approved', $opts->json('triggers'));
        $this->assertContains('rejected', $opts->json('triggers'));

        // store recipient approve TO + reject CC
        $this->postJson('/api/v1/email-recipients', [
            'document_type' => 'standarisasi_tumpukan', 'trigger' => 'approved', 'recipient_type' => 'email', 'field' => 'TO', 'email' => 'approve@example.com',
        ])->assertCreated();
        $this->postJson('/api/v1/email-recipients', [
            'document_type' => 'standarisasi_tumpukan', 'trigger' => 'rejected', 'recipient_type' => 'email', 'field' => 'CC', 'email' => 'reject@example.com',
        ])->assertCreated();

        // index filter standarisasi
        $this->getJson('/api/v1/email-recipients?document_type=standarisasi_tumpukan')->assertOk()->assertJsonCount(2, 'data');

        // siapkan produk + standarisasi pending
        $npn = Npn::create(['BOSnetszProductId' => 'B-STD-01', 'SAPszProductId' => 'SAP-STD-01', 'szNickName' => 'Produk Standarisasi', 'szStatus' => 'EXISTING']);
        $stand = StandarisasiTumpukan::create([
            'npn_id' => $npn->id,
            'tier' => 3,
            'tinggi_tumpukan' => 2,
            'status' => 'pending',
            'requested_by' => $this->admin->id,
            'requested_by_email' => $this->admin->email,
            'kode_depo' => $this->admin->kode_depo,
            'nama_depo' => $this->admin->nama_depo,
        ]);

        // approve → email dikirim (approve@example.com)
        $approveRes = $this->postJson("/api/v1/standarisasi-tumpukan/{$stand->id}/approve")->assertOk();
        $this->assertSame('approved', $approveRes->json('data.status'));

        Mail::assertSent(StandarisasiStatusNotification::class, function ($mail) use ($npn) {
            return $mail->hasTo('approve@example.com')
                && $mail->standarisasi->npn->BOSnetszProductId === $npn->BOSnetszProductId;
        });

        // reject → email dikirim (reject@example.com sebagai CC)
        $rejectRes = $this->postJson("/api/v1/standarisasi-tumpukan/{$stand->id}/reject")->assertOk();
        $this->assertSame('rejected', $rejectRes->json('data.status'));
        Mail::assertSent(StandarisasiStatusNotification::class, function ($mail) {
            return $mail->hasCc('reject@example.com');
        });
    }

    // ============================================================
    // 10. USERS + DASHBOARD ACTIVITY  (tambahan pelengkap)
    // ============================================================
    public function test_users_dan_dashboard_activity(): void
    {
        // users index meta (UserIndexMetaTest.php:37)
        $this->getJson('/api/v1/users')->assertOk()->assertJsonStructure(['data', 'total', 'meta']);

        // create user via store (UserController.php:45) - butuh password_confirmation
        $newRole = Role::firstOrCreate(['slug' => 'staff_logistic'], ['name' => 'Staff Logistic']);
        $this->postJson('/api/v1/users', [
            'kode_depo' => 'ADMIN', 'nama_depo' => 'Kantor Pusat', 'full_name' => 'User Baru', 'email' => 'baru@onezentra.com',
            'password' => 'secret-123', 'password_confirmation' => 'secret-123', 'level' => 'staff_logistic',
        ])->assertCreated()->assertJsonPath('data.email', 'baru@onezentra.com');

        // dashboard activity (DashboardActivityTest.php:16)
        UserActivityLog::create(['user_id' => $this->admin->id, 'method' => 'GET', 'route' => 'api/v1/dashboard', 'occurred_at' => now()]);
        $this->getJson('/api/v1/dashboard/activity?days=7')->assertOk()->assertJsonPath('data.days', 7);
    }
}
