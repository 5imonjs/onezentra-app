<?php

namespace Tests\Feature;

use App\Models\GateTransaction;
use App\Models\Npn;
use App\Models\OpnameExpiredWave;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\SjValidation;
use App\Models\StandarisasiTumpukan;
use App\Models\User;
use App\Services\OpnameExpiredService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardSummaryTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string $email, array $perms, string $kodeDepo = 'DPO'): User
    {
        $role = Role::firstOrCreate(['slug' => 'dash_'.$email], ['name' => 'Dash '.$email]);
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => $email,
            'password' => 'password',
            'full_name' => 'Dash '.$email,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo Test',
            'level' => 'operator',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function perms(): array
    {
        return [
            'dashboard.view', 'rencana_kirim.view', 'receiving.view', 'sj_validation.view',
            'npn.view', 'standarisasi.view', 'opname.view', 'penerimaan.view',
        ];
    }

    public function test_summary_returns_totals_alerts_quality_sla_recent(): void
    {
        $user = $this->userWith('dash-sum@example.com', $this->perms());
        Sanctum::actingAs($user);

        $npn = Npn::create([
            'BOSnetszProductId' => 'B-1', 'SAPszProductId' => 'SAP-1', 'szNickName' => 'P1',
            'szStatus' => 'EXISTING', 'decVolume' => 0, 'SAPdecUom' => 0,
        ]);
        // Produk kedua: volume lengkap tapi tanpa master umur.
        Npn::create([
            'BOSnetszProductId' => 'B-2', 'SAPszProductId' => 'SAP-2', 'szNickName' => 'P2',
            'szStatus' => 'EXISTING', 'decVolume' => 100, 'SAPdecUom' => 10,
        ]);
        StandarisasiTumpukan::create([
            'npn_id' => $npn->id, 'tier' => 3, 'tinggi_tumpukan' => 2, 'total_tier_tinggi' => 6,
            'status' => 'pending', 'requested_by' => $user->id, 'requested_by_email' => $user->email,
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test',
        ]);
        OpnameExpiredWave::query()->delete();
        ReceivingItem::create([
            'source' => 'IMPORT_MANUAL', 'kode_barang' => 'B-1', 'nama_barang' => 'P1',
            'actual_qty' => 5, 'expected_qty' => 5, 'qty_pcs' => 5, 'satuan' => 'CRT',
            'expired_date' => now()->addDays(3)->toDateString(),
            'tanggal_penerimaan' => now()->toDateString(),
            'sumber_material' => 'PT Test', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test',
            'condition' => 'FISIK_BAGUS', 'scanned_by' => $user->id,
        ]);
        app(OpnameExpiredService::class)->generate();
        $rk = RencanaKirim::create([
            'po_transporter' => 'SJ-01', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test',
            'status' => 'scheduled', 'created_by' => $user->id,
        ]);
        SjValidation::create(['rencana_kirim_id' => $rk->id, 'status' => 'IN_PROGRESS', 'scan_code' => 'SJ-01']);
        ReceivingItem::create([
            'source' => 'VALIDASI_SJ', 'kode_barang' => 'B-1', 'nama_barang' => 'P1',
            'actual_qty' => 5, 'expected_qty' => 5, 'expired_date' => now()->addYear()->toDateString(),
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'condition' => 'FISIK_BAGUS',
        ]);

        $res = $this->getJson('/api/v1/dashboard/summary');

        $res->assertOk();
        $data = $res->json('data');
        $this->assertSame(1, $data['totals']['rencana_kirim']);
        $this->assertSame(1, $data['totals']['penerimaan']);
        $this->assertSame(2, $data['totals']['npn']);
        $this->assertSame(1, $data['alerts']['standarisasi_pending']);
        $this->assertSame(1, $data['alerts']['expired_kritis']);
        $this->assertSame(1, $data['alerts']['expired_total']);
        $this->assertSame(1, $data['quality']['npn_no_volume']);
        // Kedua produk belum punya master umur.
        $this->assertSame(2, $data['quality']['npn_no_umur']);
        $this->assertSame(1, $data['sla']['sj_open_count']);
        $this->assertSame(0, $data['sla']['sj_oldest_days']);
        $this->assertSame(1, $data['opname_at_risk']['kritis_rows']);
        $this->assertGreaterThan(0, $data['opname_at_risk']['pcs']);
        $this->assertNotEmpty($data['recent']);
    }

    public function test_summary_requires_dashboard_view(): void
    {
        Sanctum::actingAs($this->userWith('dash-noperm@example.com', ['npn.view']));

        $this->getJson('/api/v1/dashboard/summary')->assertForbidden();
    }

    public function test_summary_hides_modules_without_permission(): void
    {
        Sanctum::actingAs($this->userWith('dash-min@example.com', ['dashboard.view', 'npn.view']));
        Npn::create(['BOSnetszProductId' => 'B-9', 'szNickName' => 'P9', 'szStatus' => 'EXISTING']);

        $res = $this->getJson('/api/v1/dashboard/summary')->assertOk();

        $this->assertArrayHasKey('npn', $res->json('data.totals'));
        $this->assertArrayNotHasKey('rencana_kirim', $res->json('data.totals'));
        $this->assertNull($res->json('data.opname_at_risk'));
        $this->assertSame(0, $res->json('data.inbound_selisih.items'));
        $this->assertSame(0, $res->json('data.sla.rk_checked_in_count'));
        $this->assertSame([], $res->json('data.recent'));
    }

    public function test_summary_sla_avg_gate_to_receiving(): void
    {
        $user = $this->userWith('dash-sla@example.com', $this->perms());
        Sanctum::actingAs($user);

        $rk = RencanaKirim::create([
            'po_transporter' => 'SJ-SLA', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test',
            'status' => 'scheduled', 'created_by' => $user->id,
        ]);
        $gate = GateTransaction::create([
            'rencana_kirim_id' => $rk->id, 'po_transporter' => 'SJ-SLA',
            'status' => 'checked_in', 'scan_time' => now()->subHours(3),
        ]);
        Receiving::create([
            'rencana_kirim_id' => $rk->id, 'gate_transaction_id' => $gate->id, 'status' => 'pending',
        ]);

        $res = $this->getJson('/api/v1/dashboard/summary')->assertOk();

        $this->assertEqualsWithDelta(3.0, (float) $res->json('data.sla.avg_gate_to_receiving_hours'), 0.2);
    }

    public function test_summary_inbound_selisih_by_sign_and_rk_checkin_aging(): void
    {
        $user = $this->userWith('dash-selisih@example.com', $this->perms());
        Sanctum::actingAs($user);

        $rk = RencanaKirim::create([
            'po_transporter' => 'SJ-SELISIH', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test',
            'status' => 'CHECKED_IN', 'created_by' => $user->id,
            'checked_in_at' => now()->subDays(2),
        ]);
        $receiving = Receiving::create([
            'rencana_kirim_id' => $rk->id, 'status' => 'pending',
        ]);
        ReceivingItem::create([
            'source' => 'VALIDASI_SJ', 'receiving_id' => $receiving->id, 'kode_barang' => 'B-1',
            'nama_barang' => 'P1', 'expected_qty' => 10, 'actual_qty' => 8, 'selisih_qty' => -2,
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'condition' => 'FISIK_BAGUS',
        ]);
        ReceivingItem::create([
            'source' => 'VALIDASI_SJ', 'receiving_id' => $receiving->id, 'kode_barang' => 'B-2',
            'nama_barang' => 'P2', 'expected_qty' => 10, 'actual_qty' => 13, 'selisih_qty' => 3,
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'condition' => 'FISIK_BAGUS',
        ]);

        $res = $this->getJson('/api/v1/dashboard/summary')->assertOk();

        $this->assertSame(2, $res->json('data.inbound_selisih.items'));
        $this->assertSame(1, $res->json('data.inbound_selisih.kurang'));
        $this->assertSame(1, $res->json('data.inbound_selisih.lebih'));
        $this->assertSame(1, $res->json('data.sla.rk_checked_in_count'));
        $this->assertSame(2, $res->json('data.sla.rk_checked_in_oldest_days'));
    }
}
