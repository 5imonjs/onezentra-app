<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PenerimaanReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'report_view'], ['name' => 'Report View']);
        foreach (['reports.view', 'depot.view_all'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Reports']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->user = User::create([
            'email' => 'report-view@test.com',
            'password' => 'password',
            'full_name' => 'Report User',
            'kode_depo' => '0000',
            'nama_depo' => 'Kantor Pusat',
            'level' => 'admin_distirbusi',
            'status' => 'active',
        ]);
        $role->users()->attach($this->user->id);
        Sanctum::actingAs($this->user);
    }

    private function makeItem(string $source, string $kodeBarang, ?string $tanggal = '2026-09-01'): ReceivingItem
    {
        return ReceivingItem::create([
            'source' => $source,
            'kode_barang' => $kodeBarang,
            'nama_barang' => 'Produk '.$kodeBarang,
            'expected_qty' => 10,
            'actual_qty' => $source === 'VALIDASI_SJ' ? 8 : 10,
            'selisih_qty' => $source === 'VALIDASI_SJ' ? -2 : 0,
            'qty_pcs' => 80,
            'satuan' => 'CRT',
            'expired_date' => '2026-12-01',
            'tanggal_penerimaan' => $tanggal,
            'sumber_material' => 'PT Sumber',
            'kode_depo' => '0127',
            'nama_depo' => 'Singkawang',
            'condition' => 'FISIK_BAGUS',
        ]);
    }

    public function test_penerimaan_report_filters_and_summary(): void
    {
        $this->makeItem('VALIDASI_SJ', 'BRG-A');
        $this->makeItem('IMPORT_MANUAL', 'BRG-B');
        $this->makeItem('IMPORT_MANUAL', 'BRG-C', '2026-08-20');

        $this->getJson('/api/v1/reports/penerimaan?tanggal_from=2026-09-01&tanggal_to=2026-09-30')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 2)
            ->assertJsonPath('summary.item_sj', 1)
            ->assertJsonPath('summary.item_manual', 1)
            ->assertJsonPath('summary.total_selisih', -2);
    }

    public function test_penerimaan_report_filters_by_sumber_and_search(): void
    {
        $this->makeItem('VALIDASI_SJ', 'BRG-A');
        $this->makeItem('IMPORT_MANUAL', 'BRG-B');

        $this->getJson('/api/v1/reports/penerimaan?sumber=VALIDASI_SJ')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 1)
            ->assertJsonPath('data.0.sumber', 'VALIDASI_SJ')
            ->assertJsonPath('data.0.qty_crt', 8);

        $this->getJson('/api/v1/reports/penerimaan?search=BRG-B')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 1)
            ->assertJsonPath('data.0.kode_barang', 'BRG-B');
    }

    public function test_penerimaan_report_deop_scope_hides_other_depot(): void
    {
        $this->makeItem('IMPORT_MANUAL', 'BRG-A');
        $this->makeItem('IMPORT_MANUAL', 'BRG-B', '2026-09-01');

        $depotUser = User::create([
            'email' => 'depot-0127@test.com',
            'password' => 'password',
            'full_name' => 'Depot User',
            'kode_depo' => '0127',
            'nama_depo' => 'Singkawang',
            'level' => 'admin_distirbusi',
            'status' => 'active',
        ]);

        $item = $this->makeItem('IMPORT_MANUAL', 'BRG-C', '2026-09-01');
        $item->update(['kode_depo' => '0999', 'nama_depo' => 'Depo Lain']);

        $role = Role::firstOrCreate(['slug' => 'report_view_depot'], ['name' => 'Report View Depot']);
        $role->permissions()->syncWithoutDetaching([Permission::where('slug', 'reports.view')->first()->id]);
        $role->users()->attach($depotUser->id);

        Sanctum::actingAs($depotUser);

        $this->getJson('/api/v1/reports/penerimaan')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 2)
            ->assertJsonPath('data.0.kode_barang', 'BRG-B');
    }

    public function test_penerimaan_report_export_returns_file(): void
    {
        $this->makeItem('VALIDASI_SJ', 'BRG-A');

        $response = $this->get('/api/v1/reports/penerimaan/export?tanggal_from=2026-09-01');

        $response->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->assertStringContainsString('laporan-penerimaan', $response->headers->get('content-disposition'));
    }
}
