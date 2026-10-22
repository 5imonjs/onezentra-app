<?php

namespace Tests\Feature;

use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDetail;
use App\Models\BiayaThl;
use App\Models\BiayaThlDetail;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportSelisihBiayaTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(array $permSlugs): User
    {
        $role = Role::firstOrCreate(['slug' => 'report_selisih_test'], ['name' => 'Report Selisih Test']);
        foreach ($permSlugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => 'sel-'.uniqid().'@test.com', 'password' => 'password', 'full_name' => 'Selisih User',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'level' => 'staff_logistic', 'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function makeSelisihGraph(User $user): void
    {
        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-SEL', 'status' => 'COMPLETED', 'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test', 'created_by' => $user->id,
        ]);
        $receiving = Receiving::create(['rencana_kirim_id' => $rk->id, 'status' => 'COMPLETED']);
        foreach ([['selisih_qty' => -2, 'expected_qty' => 10, 'actual_qty' => 8], ['selisih_qty' => 3, 'expected_qty' => 10, 'actual_qty' => 13], ['selisih_qty' => 0, 'expected_qty' => 10, 'actual_qty' => 10]] as $i => $row) {
            ReceivingItem::create(array_merge([
                'receiving_id' => $receiving->id,
                'source' => 'VALIDASI_SJ', 'kode_barang' => 'BRG-SEL-'.$i, 'nama_barang' => 'Barang Selisih',
                'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test',
            ], $row));
        }
    }

    public function test_selisih_qty_summary_counts_via_sql(): void
    {
        $user = $this->userWith(['reports.selisih_qty']);
        $this->makeSelisihGraph($user);
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/reports/selisih-qty')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 2)
            ->assertJsonPath('summary.total_selisih', 1)
            ->assertJsonPath('summary.item_kurang', 1)
            ->assertJsonPath('summary.item_lebih', 1);
    }

    public function test_biaya_thl_report_summary(): void
    {
        $user = $this->userWith(['reports.biaya_thl']);
        Sanctum::actingAs($user);
        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test',
            'created_by' => $user->id, 'status' => 'approved', 'nominal_biaya' => 150000,
        ]);
        BiayaThlDetail::create([
            'biaya_thl_id' => $biaya->id, 'no_surat_jalan' => 'SJ-1', 'nama_thl' => 'Budi',
            'nominal_biaya' => 100000, 'order' => 0,
        ]);
        BiayaThlDetail::create([
            'biaya_thl_id' => $biaya->id, 'no_surat_jalan' => 'SJ-2', 'nama_thl' => 'Andi',
            'nominal_biaya' => 50000, 'order' => 1,
        ]);

        $this->getJson('/api/v1/reports/biaya-thl')
            ->assertOk()
            ->assertJsonPath('summary.total_pengajuan', 1)
            ->assertJsonPath('summary.total_detail', 2)
            ->assertJsonPath('summary.total_nominal', 150000)
            ->assertJsonPath('summary.total_tenaga_kerja', 2);
    }

    public function test_biaya_retribusi_report_summary(): void
    {
        $user = $this->userWith(['reports.biaya_retribusi']);
        Sanctum::actingAs($user);
        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test',
            'created_by' => $user->id, 'status' => 'approved', 'nominal_biaya' => 50000,
        ]);
        BiayaRetribusiDetail::create(['biaya_retribusi_id' => $biaya->id, 'nominal_biaya' => 20000]);
        BiayaRetribusiDetail::create(['biaya_retribusi_id' => $biaya->id, 'nominal_biaya' => 30000]);

        $this->getJson('/api/v1/reports/biaya-retribusi')
            ->assertOk()
            ->assertJsonPath('summary.total_pengajuan', 1)
            ->assertJsonPath('summary.total_detail', 2)
            ->assertJsonPath('summary.total_nominal', 50000);
    }

    public function test_biaya_report_requires_specific_permission(): void
    {
        Sanctum::actingAs($this->userWith(['reports.selisih_qty']));

        $this->getJson('/api/v1/reports/biaya-thl')->assertForbidden();
        $this->getJson('/api/v1/reports/biaya-retribusi')->assertForbidden();
    }

    public function test_biaya_thl_export_downloads(): void
    {
        $user = $this->userWith(['reports.biaya_thl']);
        Sanctum::actingAs($user);
        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test',
            'created_by' => $user->id, 'status' => 'approved', 'nominal_biaya' => 100000,
        ]);
        BiayaThlDetail::create(['biaya_thl_id' => $biaya->id, 'nama_thl' => 'Budi', 'nominal_biaya' => 100000]);

        $response = $this->get('/api/v1/reports/biaya-thl/export');
        $response->assertOk();
        $this->assertStringContainsString('spreadsheetml', $response->headers->get('Content-Type') ?? '');
    }
}
