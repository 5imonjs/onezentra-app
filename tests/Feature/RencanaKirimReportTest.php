<?php

namespace Tests\Feature;

use App\Exports\RencanaKirimReportExport;
use App\Models\Npn;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RencanaKirimReportTest extends TestCase
{
    use RefreshDatabase;

    private function viewer(bool $viewAll = true): User
    {
        $role = Role::firstOrCreate(['slug' => 'rk_report_view'], ['name' => 'RK Report View']);
        $perm = Permission::firstOrCreate(
            ['slug' => 'reports.rencana_kirim'],
            ['name' => 'reports.rencana_kirim', 'menu_group' => 'Laporan']
        );
        $role->permissions()->syncWithoutDetaching([$perm->id]);

        if ($viewAll) {
            $viewAllPerm = Permission::firstOrCreate(
                ['slug' => 'depot.view_all'],
                ['name' => 'depot.view_all']
            );
            $role->permissions()->syncWithoutDetaching([$viewAllPerm->id]);
        }

        $user = User::create([
            'email' => 'rk-report-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'RK Report User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function createRk(User $user, array $overrides = []): RencanaKirim
    {
        return RencanaKirim::create([
            'po_transporter' => 'PO-REPORT-'.uniqid(),
            'status' => 'SCHEDULED',
            'rkh_date' => now()->toDateString(),
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'total_qty' => 10,
            'created_by' => $user->id,
            ...$overrides,
        ]);
    }

    public function test_report_requires_reports_view_permission(): void
    {
        $user = $this->viewer();
        $user->roles()->detach();
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/reports/rencana-kirim')->assertForbidden();
    }

    public function test_report_returns_rows_and_summary(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $rk = $this->createRk($user, ['total_qty' => 25]);
        $this->createRk($user, ['status' => 'COMPLETED', 'total_qty' => 5]);
        $this->createRk($user, ['status' => 'CANCELLED']);

        $res = $this->getJson('/api/v1/reports/rencana-kirim')->assertOk();

        $res->assertJsonCount(3, 'data');
        $res->assertJsonPath('summary.total', 3);
        $res->assertJsonPath('summary.total_qty', 40);
        $res->assertJsonPath('summary.completed_count', 1);
        $res->assertJsonPath('summary.cancelled_count', 1);
        $res->assertJsonPath('summary.status_counts.SCHEDULED.count', 1);
        // Urutan: rkh_date desc lalu id desc → RK terakhir (CANCELLED) di posisi 0.
        $res->assertJsonPath('data.0.status', 'CANCELLED');
        $res->assertJsonPath('data.2.po_transporter', $rk->po_transporter);
    }

    public function test_report_filters_by_status_and_date(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $this->createRk($user, ['rkh_date' => now()->subDays(10)->toDateString()]);
        $target = $this->createRk($user, ['status' => 'COMPLETED', 'rkh_date' => now()->subDay()->toDateString()]);

        $res = $this->getJson('/api/v1/reports/rencana-kirim?status=COMPLETED&date_from='.now()->subWeek()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $target->id);

        $res->assertJsonPath('summary.total', 1);
    }

    public function test_report_is_scoped_to_user_depot_for_depot_scoped_users(): void
    {
        $user = $this->viewer(false); // tanpa depot.view_all → terkunci ke depo user
        Sanctum::actingAs($user);

        $this->createRk($user); // DPO
        $this->createRk($user, ['kode_depo' => 'LAIN', 'nama_depo' => 'Depo Lain']);

        $this->getJson('/api/v1/reports/rencana-kirim')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.kode_depo', 'DPO');
    }

    public function test_report_filters_by_kode_depo_for_view_all_users(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $this->createRk($user);
        $other = $this->createRk($user, ['kode_depo' => 'LAIN', 'nama_depo' => 'Depo Lain']);

        $this->getJson('/api/v1/reports/rencana-kirim?kode_depo=LAIN')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $other->id);
    }

    public function test_report_rejects_invalid_status_filter(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/reports/rencana-kirim?status=HOAX')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status']);
    }

    public function test_export_returns_xlsx(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $this->createRk($user);

        $this->get('/api/v1/reports/rencana-kirim/export?status=SCHEDULED')
            ->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    public function test_export_map_includes_kubikasi_column(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $npn = Npn::create([
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'szNickName' => 'Produk Kubikasi',
            'SAPszProductId' => 'SAP-KUB-01',
            'SAPszUomId' => 'CRT',
            'SAPdecUom' => '12',
            'decVolume' => '5000',
            'szStatus' => 'EXISTING',
        ]);
        $rk = $this->createRk($user);
        RencanaKirimItem::create([
            'rencana_kirim_id' => $rk->id,
            'npn_id' => $npn->id,
            'item_number' => 1,
            'kode_barang' => 'SAP-KUB-01',
            'nama_barang' => 'Produk Kubikasi',
            'jumlah' => 10,
            'satuan' => 'CRT',
        ]);

        $export = new RencanaKirimReportExport(null, null, null, null, null, $user);

        $headings = $export->headings();
        $this->assertContains('Kubikasi (m³)', $headings);
        $kubikasiIndex = array_search('Kubikasi (m³)', $headings);
        $this->assertSame(array_search('Total Qty', $headings) + 1, $kubikasiIndex);

        // 10 x 5000 x 12 / 1.000.000 = 0,6 m³ (rumus yang sama dengan ReportController).
        $row = $export->map($rk->fresh(['items.npn']));
        $this->assertEqualsWithDelta(0.6, $row[$kubikasiIndex], 0.001);
    }

    public function test_report_paginates_but_summary_covers_all_filtered_rows(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $this->createRk($user, ['total_qty' => 25]);
        $this->createRk($user, ['status' => 'COMPLETED', 'total_qty' => 5]);
        $this->createRk($user, ['status' => 'CANCELLED']);

        $res = $this->getJson('/api/v1/reports/rencana-kirim?per_page=2')->assertOk();

        $res->assertJsonCount(2, 'data');
        $res->assertJsonPath('current_page', 1);
        $res->assertJsonPath('last_page', 2);
        $res->assertJsonPath('per_page', 2);
        $res->assertJsonPath('total', 3);
        // Ringkasan tetap dihitung dari seluruh baris terfilter.
        $res->assertJsonPath('summary.total', 3);
        $res->assertJsonPath('summary.total_qty', 40);

        $this->getJson('/api/v1/reports/rencana-kirim?per_page=2&page=2')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('current_page', 2);
    }

    public function test_report_rejects_invalid_pagination_params(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/reports/rencana-kirim?per_page=0')->assertStatus(422);
        $this->getJson('/api/v1/reports/rencana-kirim?per_page=101')->assertStatus(422);
        $this->getJson('/api/v1/reports/rencana-kirim?page=0')->assertStatus(422);
    }
}
