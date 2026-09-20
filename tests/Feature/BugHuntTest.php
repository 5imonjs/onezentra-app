<?php

namespace Tests\Feature;

use App\Models\EmailSetting;
use App\Models\Npn;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BugHuntTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $otherDepotUser;

    protected function setUp(): void
    {
        parent::setUp();

        $roleAdmin = Role::firstOrCreate(['slug' => 'bug_admin'], ['name' => 'Bug Admin']);
        $roleOther = Role::firstOrCreate(['slug' => 'bug_other'], ['name' => 'Bug Other']);
        $perms = ['rencana_kirim.view', 'rencana_kirim.create', 'rencana_kirim.edit', 'rencana_kirim.delete', 'gate.view', 'gate.create', 'sj_validation.view', 'sj_validation.create', 'sj_validation.edit', 'receiving.view', 'receiving.create', 'receiving.edit', 'receiving.delete', 'penerimaan.view', 'penerimaan.create', 'penerimaan.edit', 'penerimaan.delete', 'users.view', 'emails.view', 'emails.edit', 'opname.view', 'reports.view', 'dashboard.view'];
        foreach ($perms as $slug) {
            $p = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Bug']);
            $roleAdmin->permissions()->syncWithoutDetaching([$p->id]);
        }
        // other depot hanya punya sebagian
        foreach (['rencana_kirim.view', 'penerimaan.view'] as $slug) {
            $p = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug]);
            $roleOther->permissions()->syncWithoutDetaching([$p->id]);
        }

        $this->admin = User::create(['email' => 'bug_admin@test.com', 'password' => 'password', 'full_name' => 'Bug Admin', 'kode_depo' => 'BUG-A', 'nama_depo' => 'Depo A', 'level' => 'admin', 'status' => 'active', 'role_id' => $roleAdmin->id]);
        $roleAdmin->users()->attach($this->admin->id);
        $this->otherDepotUser = User::create(['email' => 'bug_other@test.com', 'password' => 'password', 'full_name' => 'Bug Other', 'kode_depo' => 'BUG-B', 'nama_depo' => 'Depo B', 'level' => 'operator', 'status' => 'active', 'role_id' => $roleOther->id]);
        $roleOther->users()->attach($this->otherDepotUser->id);

        Npn::create(['szNickName' => 'Bug Produk', 'BOSnetszProductId' => 'B-BUG-01', 'SAPszProductId' => 'SAP-BUG-01', 'szBarcode' => 'BC-BUG-01', 'szStatus' => 'EXISTING']);
    }

    public function test_auth_bypass_tanpa_token_ditolak(): void
    {
        // Tanpa actingAs harus 401
        $this->getJson('/api/v1/rencana-kirim')->assertUnauthorized();
        $this->getJson('/api/v1/penerimaan')->assertUnauthorized();
        $this->getJson('/api/v1/users')->assertUnauthorized();
        $this->postJson('/api/v1/rencana-kirim', [])->assertUnauthorized();
    }

    public function test_permission_bypass_ditolak(): void
    {
        // other user tidak punya rencana_kirim.create -> 403
        Sanctum::actingAs($this->otherDepotUser);
        $this->postJson('/api/v1/rencana-kirim', ['po_transporter' => 'SJ-BUG', 'items' => [['item_number' => 1, 'nama_barang' => 'X', 'jumlah' => 1]]])->assertForbidden();
        // tidak punya receiving.create
        $this->postJson('/api/v1/receivings', ['rencana_kirim_id' => 1])->assertForbidden();
    }

    public function test_depot_scope_bypass_ditolak(): void
    {
        Sanctum::actingAs($this->admin);
        $rk = RencanaKirim::create(['po_transporter' => 'SJ-DEPOT-A', 'kode_depo' => 'BUG-A', 'nama_depo' => 'Depo A', 'status' => 'DRAFT', 'created_by' => $this->admin->id]);
        // other depot coba akses detail -> 403
        Sanctum::actingAs($this->otherDepotUser);
        $this->getJson("/api/v1/rencana-kirim/{$rk->id}")->assertForbidden();
        $this->putJson("/api/v1/rencana-kirim/{$rk->id}", ['notes' => 'hacked'])->assertForbidden();
        $this->deleteJson("/api/v1/rencana-kirim/{$rk->id}")->assertForbidden();
    }

    public function test_state_machine_bypass_ditolak(): void
    {
        Sanctum::actingAs($this->admin);
        $rk = RencanaKirim::create(['po_transporter' => 'SJ-STATE-01', 'kode_depo' => 'BUG-A', 'nama_depo' => 'Depo A', 'status' => 'DRAFT', 'created_by' => $this->admin->id]);
        RencanaKirimItem::create(['rencana_kirim_id' => $rk->id, 'npn_id' => 1, 'item_number' => 1, 'kode_barang' => 'B-BUG-01', 'nama_barang' => 'Bug Produk', 'jumlah' => 10, 'satuan' => 'CRT']);
        // DRAFT -> verify (harus 422)
        $this->postJson("/api/v1/rencana-kirim/{$rk->id}/verify")->assertStatus(422);
        // DRAFT -> gate INBOUND (harus 422)
        $this->postJson('/api/v1/gate-transactions', ['rencana_kirim_id' => $rk->id, 'gate_type' => 'INBOUND'])->assertStatus(422);
        // schedule ok
        $this->postJson("/api/v1/rencana-kirim/{$rk->id}/schedule")->assertOk();
        // schedule lagi (sudah SCHEDULED) -> 422
        $this->postJson("/api/v1/rencana-kirim/{$rk->id}/schedule")->assertStatus(422);
        // OUTBOUND sebelum COMPLETED -> 422
        $this->postJson('/api/v1/gate-transactions', ['rencana_kirim_id' => $rk->id, 'gate_type' => 'OUTBOUND'])->assertStatus(422);
        // Mass-assign status via PUT harus diabaikan (tidak bisa ubah status via PUT)
        $this->putJson("/api/v1/rencana-kirim/{$rk->id}", ['status' => 'COMPLETED'])->assertOk();
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'SCHEDULED']);
    }

    public function test_validasi_input_ditolak(): void
    {
        Sanctum::actingAs($this->admin);
        // jumlah 0 ditolak
        $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'SJ-VAL-01',
            'items' => [['item_number' => 1, 'nama_barang' => 'Bug Produk', 'jumlah' => 0, 'satuan' => 'CRT']],
        ])->assertStatus(422);
        // item_number missing
        $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'SJ-VAL-02',
            'items' => [['nama_barang' => 'Bug Produk', 'jumlah' => 5]],
        ])->assertStatus(422);
        // email recipients invalid document_type
        $this->postJson('/api/v1/email-recipients', [
            'document_type' => 'invalid', 'trigger' => 'created', 'recipient_type' => 'email', 'field' => 'TO', 'email' => 'a@b.com',
        ])->assertStatus(422);
        // email test tanpa to
        $this->postJson('/api/v1/email-settings/test', ['to' => 'not-email'])->assertStatus(422);
        // penerimaan tanpa auth sudah 401, tapi dengan auth validasi numeric
        $this->postJson('/api/v1/penerimaan', ['DO_QTY' => 'not-numeric'])->assertStatus(422);
    }

    public function test_mass_assign_tidak_bisa_inject_status(): void
    {
        Sanctum::actingAs($this->admin);
        $rk = RencanaKirim::create(['po_transporter' => 'SJ-MASS-01', 'kode_depo' => 'BUG-A', 'nama_depo' => 'Depo A', 'status' => 'DRAFT', 'created_by' => $this->admin->id]);
        // Coba inject created_by milik orang lain
        $otherId = $this->otherDepotUser->id;
        $res = $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'SJ-MASS-02',
            'created_by' => $otherId,
            'status' => 'COMPLETED',
            'items' => [['item_number' => 1, 'nama_barang' => 'Bug Produk', 'jumlah' => 1, 'satuan' => 'CRT']],
        ])->assertCreated();
        // created_by harus tetap admin, status tetap DRAFT
        $this->assertDatabaseHas('rencana_kirim', ['id' => $res->json('data.id'), 'created_by' => $this->admin->id, 'status' => 'DRAFT']);
    }

    public function test_depot_force_tidak_bisa_spoof(): void
    {
        Sanctum::actingAs($this->otherDepotUser); // depo BUG-B
        // Coba paksa kode_depo BUG-A via payload
        $res = $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'SJ-SPOOF-01',
            'kode_depo' => 'BUG-A', 'nama_depo' => 'Depo A',
            'items' => [['item_number' => 1, 'nama_barang' => 'Bug Produk', 'jumlah' => 1, 'satuan' => 'CRT']],
        ]);
        // Jika berhasil, harus tetap BUG-B karena depotAttributes force
        if ($res->status() === 201) {
            $this->assertDatabaseHas('rencana_kirim', ['id' => $res->json('data.id'), 'kode_depo' => 'BUG-B']);
        } else {
            $res->assertForbidden(); // atau 422 jika tidak punya permission create
        }
    }

    public function test_sj_validation_tidak_bisa_scan_setelah_complete(): void
    {
        Sanctum::actingAs($this->admin);
        $rk = RencanaKirim::create(['po_transporter' => 'SJ-SCAN-01', 'kode_depo' => 'BUG-A', 'nama_depo' => 'Depo A', 'status' => 'DRAFT', 'created_by' => $this->admin->id]);
        RencanaKirimItem::create(['rencana_kirim_id' => $rk->id, 'npn_id' => 1, 'item_number' => 1, 'kode_barang' => 'B-BUG-01', 'nama_barang' => 'Bug Produk', 'jumlah' => 5, 'satuan' => 'CRT']);
        $this->postJson("/api/v1/rencana-kirim/{$rk->id}/schedule")->assertOk();
        $this->postJson('/api/v1/gate-transactions', ['rencana_kirim_id' => $rk->id, 'gate_type' => 'INBOUND'])->assertCreated();
        $start = $this->postJson("/api/v1/sj-validations/start/{$rk->id}")->assertOk();
        $vid = $start->json('data.id');
        $itemId = $start->json('data.items.0.id');
        $this->postJson("/api/v1/sj-validations/{$vid}/scan", ['sj_validation_item_id' => $itemId, 'actual_qty' => 5])->assertOk();
        $this->postJson("/api/v1/sj-validations/{$vid}/complete")->assertOk();
        // scan lagi setelah complete harus 422
        $this->postJson("/api/v1/sj-validations/{$vid}/scan", ['sj_validation_item_id' => $itemId, 'actual_qty' => 5])->assertStatus(422);
    }

    public function test_receiving_hanya_dari_verified(): void
    {
        Sanctum::actingAs($this->admin);
        $rk = RencanaKirim::create(['po_transporter' => 'SJ-RCV-BUG', 'kode_depo' => 'BUG-A', 'nama_depo' => 'Depo A', 'status' => 'DRAFT', 'created_by' => $this->admin->id]);
        RencanaKirimItem::create(['rencana_kirim_id' => $rk->id, 'npn_id' => 1, 'item_number' => 1, 'kode_barang' => 'B-BUG-01', 'nama_barang' => 'Bug Produk', 'jumlah' => 5, 'satuan' => 'CRT']);
        // Coba create receiving dari DRAFT -> 422
        $this->postJson('/api/v1/receivings', ['rencana_kirim_id' => $rk->id])->assertStatus(422);
    }

    public function test_email_setting_password_terenkripsi(): void
    {
        Sanctum::actingAs($this->admin);
        $this->putJson('/api/v1/email-settings', [
            'host' => 'smtp.test.com', 'port' => 587, 'username' => 'u', 'password' => 'rahasia123', 'encryption' => 'tls', 'from_address' => 'a@b.com', 'from_name' => 'Test', 'from_system_env' => false, 'is_active' => true,
        ])->assertOk();
        $setting = EmailSetting::latest()->first();
        // password di DB harus terenkripsi (bukan plaintext, bukan bcrypt $2y$)
        $raw = DB::table('email_settings')->where('id', $setting->id)->value('password');
        $this->assertNotEquals('rahasia123', $raw);
        $this->assertStringNotContainsString('$2y$', $raw);
        $this->assertEquals('rahasia123', $setting->password); // decrypt via cast
    }

    public function test_permission_cache_invalidasi(): void
    {
        Sanctum::actingAs($this->admin);
        $role = Role::where('slug', 'bug_admin')->first();
        $perm = Permission::firstOrCreate(['slug' => 'cache.test.perm'], ['name' => 'Cache Test', 'menu_group' => 'Bug']);
        // sebelum sync, admin tidak punya perm ini
        $this->assertFalse($this->admin->hasPermission('cache.test.perm'));
        $role->permissions()->attach($perm);
        // cache harus invalid, sekarang punya
        User::clearPermissionCache($this->admin->id);
        $this->assertTrue($this->admin->fresh()->hasPermission('cache.test.perm'));
        // cleanup
        $role->permissions()->detach($perm);
        User::clearPermissionCache($this->admin->id);
    }

    public function test_rate_limit_login(): void
    {
        // tanpa actingAs, hit login 11x cepat -> yang ke-11 harus 429
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/v1/login', ['email' => 'bug_admin@test.com', 'password' => 'wrong'])->assertStatus(422);
        }
        $this->postJson('/api/v1/login', ['email' => 'bug_admin@test.com', 'password' => 'wrong'])->assertStatus(429);
    }
}
