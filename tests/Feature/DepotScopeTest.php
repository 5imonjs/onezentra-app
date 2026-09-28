<?php

namespace Tests\Feature;

use App\Models\Npn;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DepotScopeTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $level, string $kodeDepo, string $namaDepo, string $slug = 'sdp_'): User
    {
        $role = Role::firstOrCreate(['slug' => $slug.$kodeDepo], [
            'name' => ucfirst($level),
            'description' => $namaDepo,
        ]);

        $user = User::create([
            'email' => strtolower($kodeDepo).'@depot.test',
            'password' => 'password',
            'full_name' => 'User '.$namaDepo,
            'kode_depo' => $kodeDepo,
            'nama_depo' => $namaDepo,
            'level' => $level,
            'role_id' => $role->id,
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function grant(User $user, string $slug): void
    {
        $perm = Permission::firstOrCreate(['slug' => $slug], [
            'name' => ucfirst($slug),
            'menu_group' => 'Test',
        ]);
        Role::where('id', $user->role_id)->first()->permissions()->attach($perm);
    }

    public function test_npn_is_global_across_depots(): void
    {
        $planner = $this->makeUser('admin_planner', 'PLAN-01', 'Depo Planner');
        $cheker = $this->makeUser('cheker', 'CHEK-01', 'Depo Cheker');

        Npn::create(['szNickName' => 'PRODUK-PLAN', 'BOSnetszProductId' => 'B-PLAN', 'kode_depo' => 'PLAN-01', 'nama_depo' => 'Depo Planner', 'szStatus' => 'EXISTING']);
        Npn::create(['szNickName' => 'PRODUK-CHEK', 'BOSnetszProductId' => 'B-CHEK', 'kode_depo' => 'CHEK-01', 'nama_depo' => 'Depo Cheker', 'szStatus' => 'EXISTING']);

        $this->grant($planner, 'npn.view');
        Sanctum::actingAs($planner);

        $this->getJson('/api/v1/npn')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_non_admin_only_sees_own_depot_rencana_kirim(): void
    {
        $planner = $this->makeUser('admin_planner', 'PLAN-01', 'Depo Planner');
        $cheker = $this->makeUser('cheker', 'CHEK-01', 'Depo Cheker');

        RencanaKirim::create(['po_transporter' => 'SJ-PLAN', 'kode_depo' => 'PLAN-01', 'nama_depo' => 'Depo Planner', 'status' => 'DRAFT', 'created_by' => $planner->id]);
        RencanaKirim::create(['po_transporter' => 'SJ-CHEK', 'kode_depo' => 'CHEK-01', 'nama_depo' => 'Depo Cheker', 'status' => 'DRAFT', 'created_by' => $cheker->id]);

        $this->grant($planner, 'rencana_kirim.view');
        Sanctum::actingAs($planner);

        $response = $this->getJson('/api/v1/rencana-kirim');
        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('SJ-PLAN', $response->json('data.0.po_transporter'));
    }

    public function test_non_admin_cannot_access_other_depot_detail(): void
    {
        $cheker = $this->makeUser('cheker', 'CHEK-01', 'Depo Cheker');
        $planner = $this->makeUser('admin_planner', 'PLAN-01', 'Depo Planner');

        $rk = RencanaKirim::create(['po_transporter' => 'SJ-PLAN', 'kode_depo' => 'PLAN-01', 'nama_depo' => 'Depo Planner', 'status' => 'DRAFT', 'created_by' => $planner->id]);

        $this->grant($cheker, 'rencana_kirim.view');
        Sanctum::actingAs($cheker);

        $this->getJson("/api/v1/rencana-kirim/{$rk->id}")->assertForbidden();
    }

    public function test_admin_master_sees_all_depots(): void
    {
        $admin = $this->makeUser('admin_master', 'ADMIN', 'Admin Utama');
        $planner = $this->makeUser('admin_planner', 'PLAN-01', 'Depo Planner');
        $cheker = $this->makeUser('cheker', 'CHEK-01', 'Depo Cheker');

        RencanaKirim::create(['po_transporter' => 'SJ-PLAN', 'kode_depo' => 'PLAN-01', 'nama_depo' => 'Depo Planner', 'status' => 'DRAFT', 'created_by' => $planner->id]);
        RencanaKirim::create(['po_transporter' => 'SJ-CHEK', 'kode_depo' => 'CHEK-01', 'nama_depo' => 'Depo Cheker', 'status' => 'DRAFT', 'created_by' => $cheker->id]);

        $this->grant($admin, 'rencana_kirim.view');
        $this->grant($admin, 'depot.view_all');
        Sanctum::actingAs($admin);

        $this->getJson('/api/v1/rencana-kirim')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_store_forces_depot_for_non_admin(): void
    {
        $cheker = $this->makeUser('cheker', 'CHEK-01', 'Depo Cheker');
        $this->grant($cheker, 'rencana_kirim.create');
        Sanctum::actingAs($cheker);

        Npn::create(['szNickName' => 'Obat X', 'BOSnetszProductId' => 'B-OBATX', 'szStatus' => 'EXISTING']);

        $response = $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'SJ-FORCED',
            'items' => [
                ['item_number' => 1, 'nama_barang' => 'Obat X', 'jumlah' => 5, 'satuan' => 'karton'],
            ],
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('rencana_kirim', [
            'po_transporter' => 'SJ-FORCED',
            'kode_depo' => 'CHEK-01',
            'nama_depo' => 'Depo Cheker',
        ]);
    }

    public function test_depo_list_scoped_to_own_depot(): void
    {
        $planner = $this->makeUser('admin_planner', 'PLAN-01', 'Depo Planner');
        $cheker = $this->makeUser('cheker', 'CHEK-01', 'Depo Cheker');

        $this->grant($planner, 'rencana_kirim.view');
        $this->grant($cheker, 'rencana_kirim.view');
        Sanctum::actingAs($planner);

        $response = $this->getJson('/api/v1/depo');
        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('PLAN-01', $response->json('data.0.kode_depo'));
    }

    public function test_depo_list_shows_all_for_admin_master(): void
    {
        $admin = $this->makeUser('admin_master', 'ADMIN', 'Admin Utama');
        $this->makeUser('cheker', 'CHEK-01', 'Depo Cheker');

        $this->grant($admin, 'rencana_kirim.view');
        $this->grant($admin, 'depot.view_all');
        Sanctum::actingAs($admin);

        $response = $this->getJson('/api/v1/depo');
        $response->assertOk();
        $this->assertCount(2, $response->json('data'));
    }

    public function test_selisih_qty_report_scoped_to_own_depot(): void
    {
        $planner = $this->makeUser('admin_planner', 'PLAN-01', 'Depo Planner');
        $cheker = $this->makeUser('cheker', 'CHEK-01', 'Depo Cheker');

        $rkPlan = RencanaKirim::create(['po_transporter' => 'SJ-CHEK', 'kode_depo' => 'PLAN-01', 'nama_depo' => 'Depo Planner', 'status' => 'DRAFT', 'created_by' => $planner->id]);
        $rkChek = RencanaKirim::create(['po_transporter' => 'SJ-CHEK', 'kode_depo' => 'CHEK-01', 'nama_depo' => 'Depo Cheker', 'status' => 'DRAFT', 'created_by' => $cheker->id]);

        $recPlan = Receiving::create(['rencana_kirim_id' => $rkPlan->id, 'status' => 'COMPLETED']);
        $recChek = Receiving::create(['rencana_kirim_id' => $rkChek->id, 'status' => 'COMPLETED']);

        ReceivingItem::create(['receiving_id' => $recPlan->id, 'kode_barang' => 'B-PLAN', 'nama_barang' => 'Barang Plan', 'expected_qty' => 10, 'actual_qty' => 8, 'selisih_qty' => -2]);
        ReceivingItem::create(['receiving_id' => $recChek->id, 'kode_barang' => 'B-CHEK', 'nama_barang' => 'Barang Chek', 'expected_qty' => 10, 'actual_qty' => 12, 'selisih_qty' => 2]);

        $this->grant($planner, 'reports.view');
        Sanctum::actingAs($planner);

        $response = $this->getJson('/api/v1/reports/selisih-qty');
        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('B-PLAN', $response->json('data.0.kode_barang'));
    }
}
