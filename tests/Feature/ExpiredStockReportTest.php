<?php

namespace Tests\Feature;

use App\Models\OpnameExpiredWave;
use App\Models\Permission;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use App\Services\ExpiredStockReportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExpiredStockReportTest extends TestCase
{
    use RefreshDatabase;

    private function viewer(array $permissions): User
    {
        $role = Role::firstOrCreate(['slug' => 'expired_stock_'.uniqid()], ['name' => 'Expired Stock Viewer']);
        foreach (array_merge(['depot.view_all'], $permissions) as $slug) {
            $permission = Permission::firstOrCreate(
                ['slug' => $slug],
                ['name' => $slug, 'menu_group' => 'Laporan']
            );
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }

        $user = User::create([
            'email' => 'expired-stock-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Expired Stock User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function receipt(): ReceivingItem
    {
        return ReceivingItem::create([
            'source' => 'IMPORT_MANUAL',
            'kode_barang' => 'BRG-A',
            'nama_barang' => 'Produk A',
            'actual_qty' => 10,
            'expected_qty' => 10,
            'qty_pcs' => 240,
            'satuan' => 'CRT',
            'expired_date' => now()->addDays(30)->toDateString(),
            'tanggal_penerimaan' => now()->subDay()->toDateString(),
            'sumber_material' => 'PT Sumber',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'condition' => 'GOOD',
        ]);
    }

    private function wave(): OpnameExpiredWave
    {
        return OpnameExpiredWave::create([
            'week_start' => now()->startOfWeek()->toDateString(),
            'week_end' => now()->endOfWeek()->toDateString(),
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'kode_barang' => 'BRG-B',
            'nama_barang' => 'Produk B',
            'sumber_material' => 'PT Sumber',
            'expired_date_ini' => now()->addDays(5)->toDateString(),
            'sisa_hari' => 5,
            'status_ini' => 'PERHATIAN',
            'qty_ini_crt' => 10,
            'qty_ini_pcs' => 240,
            'qty_lalu_crt' => 8,
            'qty_lalu_pcs' => 192,
            'qty_koreksi_crt' => -2,
            'qty_koreksi_pcs' => -48,
        ]);
    }

    public function test_endpoint_menolak_user_tanpa_izin_laporan_manapun(): void
    {
        Sanctum::actingAs($this->viewer([]));

        $this->getJson('/api/v1/reports/expired-stock')->assertForbidden();
    }

    public function test_grain_ledger_memakai_skema_unified_dan_qty_mentah(): void
    {
        Sanctum::actingAs($this->viewer(['reports.penerimaan_batch_expired']));
        $item = $this->receipt();

        $res = $this->getJson('/api/v1/reports/expired-stock?grain=ledger')
            ->assertOk()
            ->assertJsonPath('meta.grain', 'ledger')
            ->assertJsonPath('meta.qty_sumber', 'mentah')
            ->assertJsonPath('data.0.grain', 'ledger')
            ->assertJsonPath('data.0.id', $item->id)
            ->assertJsonPath('data.0.qty_crt', 10)
            ->assertJsonPath('data.0.qty_pcs', 240)
            ->assertJsonPath('data.0.status_kode', 'FUTURE');

        $res->assertJsonPath('data.0.qty_koreksi_crt', null);
        $res->assertJsonPath('data.0.week_start', null);
        $this->assertArrayHasKey('status_tier', $res->json('data.0'));
        $this->assertArrayHasKey('rekomendasi', $res->json('data.0'));
    }

    public function test_grain_wave_memakai_skema_yang_sama_dan_qty_efektif(): void
    {
        Sanctum::actingAs($this->viewer(['reports.view', 'opname.view']));
        $wave = $this->wave();

        $res = $this->getJson('/api/v1/reports/expired-stock?grain=wave')
            ->assertOk()
            ->assertJsonPath('meta.grain', 'wave')
            ->assertJsonPath('meta.qty_sumber', 'efektif')
            ->assertJsonPath('data.0.grain', 'wave')
            ->assertJsonPath('data.0.id', $wave->id)
            ->assertJsonPath('data.0.qty_crt', 8)
            ->assertJsonPath('data.0.qty_pcs', 192)
            ->assertJsonPath('data.0.status_tier', 'PERHATIAN')
            ->assertJsonPath('data.0.status_lalu', null);

        $res->assertJsonPath('data.0.sisa_simpan', null);
        $res->assertJsonPath('data.0.tanggal_expired', $wave->expired_date_ini->toDateString());
        $this->assertArrayHasKey('cluster', $res->json('data.0'));
        $this->assertArrayHasKey('koreksi_by', $res->json('data.0'));
    }

    public function test_status_divalidasi_sesuai_grain(): void
    {
        Sanctum::actingAs($this->viewer(['reports.penerimaan_batch_expired']));

        $this->getJson('/api/v1/reports/expired-stock?grain=ledger&status=KRITIS')->assertStatus(422);
        $this->getJson('/api/v1/reports/expired-stock?grain=wave&status=FUTURE')->assertStatus(422);
    }

    public function test_query_ringkasan_wave_tidak_menyertakan_kolom_mentah(): void
    {
        // MySQL ONLY_FULL_GROUP_BY menolak `SELECT opname_expired_waves.*,
        // COUNT(*) ...` tanpa GROUP BY (error 1140). SQLite tidak, jadi pola
        // ini harus dijaga lewat SQL, bukan hanya lewat response test.
        $sql = ExpiredStockReportService::summaryQuery(['grain' => 'wave'])->toSql();

        $this->assertStringNotContainsString('opname_expired_waves.*', $sql);
        $this->assertStringNotContainsString('as principal_1', $sql);
        $this->assertStringContainsString('COUNT(*) as c', $sql);
    }

    public function test_export_mengikuti_grain(): void
    {
        Sanctum::actingAs($this->viewer(['reports.penerimaan_batch_expired']));
        $this->receipt();

        $this->get('/api/v1/reports/expired-stock/export?grain=ledger')
            ->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
}
