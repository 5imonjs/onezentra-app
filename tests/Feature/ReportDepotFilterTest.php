<?php

namespace Tests\Feature;

use App\Models\BiayaRetribusi;
use App\Models\BiayaThl;
use App\Models\OpnameExpiredWave;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Kontrak: master (depot.view_all) wajib bisa memfilter SEMUA laporan
 * per depo — baris + ringkasan + export mengikuti filter yang sama.
 * User scoped tetap terkunci ke depo sendiri walau mengirim kode_depo lain.
 */
class ReportDepotFilterTest extends TestCase
{
    use RefreshDatabase;

    private User $master;

    private User $scoped;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'report_depot_master'], ['name' => 'Report Depot Master']);
        foreach (['reports.selisih_qty', 'reports.penerimaan', 'reports.penerimaan_batch_expired', 'reports.rencana_kirim', 'reports.biaya_thl', 'reports.biaya_retribusi', 'opname.view', 'depot.view_all'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Reports']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->master = User::create([
            'email' => 'master-report@test.com',
            'password' => 'password',
            'full_name' => 'Master Report',
            'kode_depo' => 'ADMIN',
            'nama_depo' => 'Kantor Pusat',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        $role->users()->attach($this->master->id);

        $scopedRole = Role::firstOrCreate(['slug' => 'report_depot_scoped'], ['name' => 'Report Depot Scoped']);
        foreach (['reports.selisih_qty', 'reports.penerimaan', 'reports.penerimaan_batch_expired', 'reports.rencana_kirim', 'opname.view'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Reports']);
            $scopedRole->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->scoped = User::create([
            'email' => 'scoped-report@test.com',
            'password' => 'password',
            'full_name' => 'Scoped Report',
            'kode_depo' => 'DPO-A',
            'nama_depo' => 'Depo A',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $scopedRole->users()->attach($this->scoped->id);

        $this->seedDepo('DPO-A', 'Depo A');
        $this->seedDepo('DPO-B', 'Depo B');
    }

    private function seedDepo(string $kode, string $nama): void
    {
        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-'.$kode,
            'status' => 'COMPLETED',
            'kode_depo' => $kode,
            'nama_depo' => $nama,
            'created_by' => $this->master->id,
        ]);
        $receiving = Receiving::create([
            'rencana_kirim_id' => $rk->id,
            'status' => 'COMPLETED',
            'checked_by' => $this->master->id,
        ]);
        ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'source' => 'VALIDASI_SJ',
            'kode_barang' => 'BRG-'.$kode,
            'nama_barang' => 'Produk '.$kode,
            'expected_qty' => 10,
            'actual_qty' => 8,
            'selisih_qty' => -2,
            'qty_pcs' => 80,
            'satuan' => 'CRT',
            'expired_date' => '2027-01-01',
            'tanggal_penerimaan' => '2026-09-09',
            'kode_depo' => $kode,
            'nama_depo' => $nama,
            'condition' => 'FISIK_BAGUS',
            'sumber_material' => 'PT Tes',
        ]);

        $thl = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-09',
            'kode_depo' => $kode,
            'nama_depo' => $nama,
            'nominal_biaya' => 100000,
            'created_by' => $this->master->id,
            'status' => 'draft',
        ]);
        $thl->details()->create([
            'nama_thl' => 'THL '.$kode,
            'nominal_biaya' => 100000,
            'order' => 0,
        ]);

        $retribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-09',
            'kode_depo' => $kode,
            'nama_depo' => $nama,
            'nominal_biaya' => 50000,
            'created_by' => $this->master->id,
            'status' => 'draft',
        ]);
        $retribusi->details()->create([
            'no_surat_jalan' => 'SJ-'.$kode,
            'nopol_kendaraan' => 'B 1 TST',
            'nominal_biaya' => 50000,
            'order' => 0,
        ]);

        OpnameExpiredWave::create([
            'week_start' => '2026-09-07',
            'week_end' => '2026-09-13',
            'kode_depo' => $kode,
            'kode_barang' => 'BRG-'.$kode,
            'expired_date_ini' => '2027-01-01',
            'sisa_hari' => 100,
            'status_ini' => 'AMAN',
        ]);
    }

    public function test_master_filters_all_reports_by_depo(): void
    {
        Sanctum::actingAs($this->master);

        // Tanpa filter: dua depo terlihat.
        $this->getJson('/api/v1/reports/selisih-qty')->assertOk()->assertJsonPath('summary.total_item', 2);
        $this->getJson('/api/v1/reports/rencana-kirim')->assertOk()->assertJsonPath('summary.total', 2);

        // Dengan filter: hanya depo yang diminta — baris + ringkasan.
        $this->getJson('/api/v1/reports/selisih-qty?kode_depo=DPO-A')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 1)
            ->assertJsonPath('summary.total_selisih', -2);

        $this->getJson('/api/v1/reports/penerimaan?kode_depo=DPO-B')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 1)
            ->assertJsonPath('data.0.kode_barang', 'BRG-DPO-B');

        $this->getJson('/api/v1/reports/penerimaan-batch-expired?kode_depo=DPO-A')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->getJson('/api/v1/reports/rencana-kirim?kode_depo=DPO-A')
            ->assertOk()
            ->assertJsonPath('summary.total', 1)
            ->assertJsonPath('data.0.po_transporter', 'PO-DPO-A');

        $this->getJson('/api/v1/reports/biaya-thl?kode_depo=DPO-B')
            ->assertOk()
            ->assertJsonPath('summary.total_nominal', 100000);

        $this->getJson('/api/v1/reports/biaya-retribusi?kode_depo=DPO-B')
            ->assertOk()
            ->assertJsonPath('summary.total_nominal', 50000);

        $this->getJson('/api/v1/opname-expired?kode_depo=DPO-A')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.kode_depo', 'DPO-A');
    }

    public function test_master_exports_follow_depo_filter(): void
    {
        Sanctum::actingAs($this->master);

        foreach ([
            '/api/v1/reports/selisih-qty/export?kode_depo=DPO-A',
            '/api/v1/reports/penerimaan/export?kode_depo=DPO-A',
            '/api/v1/reports/rencana-kirim/export?kode_depo=DPO-A',
            '/api/v1/reports/biaya-thl/export?kode_depo=DPO-A',
            '/api/v1/reports/biaya-retribusi/export?kode_depo=DPO-A',
        ] as $url) {
            $this->get($url)->assertOk()
                ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        }
    }

    public function test_scoped_user_cannot_read_other_depo_reports(): void
    {
        Sanctum::actingAs($this->scoped);

        // Filter ke depo lain diabaikan untuk user scoped — ia tetap hanya
        // melihat depo sendiri (aman; bukan data depo lain).
        $this->getJson('/api/v1/reports/selisih-qty?kode_depo=DPO-B')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 1);

        $this->getJson('/api/v1/reports/penerimaan?kode_depo=DPO-B')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 1)
            ->assertJsonPath('data.0.kode_barang', 'BRG-DPO-A');

        // Tanpa filter: hanya depo sendiri.
        $this->getJson('/api/v1/reports/rencana-kirim')
            ->assertOk()
            ->assertJsonPath('summary.total', 1);
    }
}
