<?php

namespace Tests\Feature;

use App\Models\Npn;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RencanaKirimIndexFilterTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Regresi: frontend memanggil index dengan ?po_transporter=&kode_depo= sebagai
     * early-warning duplikat, tetapi index() dulu mengabaikan kedua parameter itu —
     * respons selalu tak terfilter sehingga peringatan tidak pernah muncul.
     */
    public function test_index_filters_by_exact_po_transporter_case_insensitively(): void
    {
        $user = $this->viewer();

        RencanaKirim::create([
            'po_transporter' => 'PO-DUP-1',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);
        RencanaKirim::create([
            'po_transporter' => 'PO-LAIN',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/rencana-kirim?po_transporter=po-dup-1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.po_transporter', 'PO-DUP-1');
    }

    public function test_index_filters_by_kode_depo(): void
    {
        $user = $this->viewer();

        RencanaKirim::create([
            'po_transporter' => 'PO-FILTER-A',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);
        RencanaKirim::create([
            'po_transporter' => 'PO-FILTER-B',
            'status' => 'DRAFT',
            'kode_depo' => 'LAIN',
            'nama_depo' => 'Depo Lain',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/rencana-kirim?kode_depo=LAIN')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.po_transporter', 'PO-FILTER-B');
    }

    public function test_index_combines_po_transporter_and_kode_depo(): void
    {
        $user = $this->viewer();

        RencanaKirim::create([
            'po_transporter' => 'PO-GABUNG',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);
        RencanaKirim::create([
            'po_transporter' => 'PO-GABUNG',
            'status' => 'DRAFT',
            'kode_depo' => 'LAIN',
            'nama_depo' => 'Depo Lain',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        // PO sama di depo berbeda: hanya kombinasi yang cocok yang dihitung duplikat.
        $this->getJson('/api/v1/rencana-kirim?po_transporter=PO-GABUNG&kode_depo=DPO')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.kode_depo', 'DPO');

        $this->getJson('/api/v1/rencana-kirim?po_transporter=PO-GABUNG&kode_depo=TIDAKADA')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_index_diurutkan_berdasarkan_tanggal_kirim_bukan_waktu_input(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        // Input terakhir justru untuk tanggal paling jauh — harus tetap muncul
        // paling bawah karena urutan memakai rkh_date.
        RencanaKirim::create([
            'po_transporter' => 'PO-LATER', 'status' => 'DRAFT',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'created_by' => $user->id,
            'rkh_date' => now()->addDays(5)->toDateString(),
        ]);
        RencanaKirim::create([
            'po_transporter' => 'PO-TOMORROW', 'status' => 'DRAFT',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'created_by' => $user->id,
            'rkh_date' => now()->addDay()->toDateString(),
        ]);
        RencanaKirim::create([
            'po_transporter' => 'PO-NODATE', 'status' => 'DRAFT',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'created_by' => $user->id,
        ]);

        $res = $this->getJson('/api/v1/rencana-kirim')->assertOk();

        $this->assertSame(
            ['PO-TOMORROW', 'PO-LATER', 'PO-NODATE'],
            collect($res->json('data'))->pluck('po_transporter')->all(),
        );
    }

    public function test_store_menyimpan_rencana_tiba_terpisah_dari_rkh(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $rkh = now()->addDay()->toDateString();
        $eta = now()->addDays(3)->toDateString();

        $res = $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'PO-ETA-1',
            'status' => 'DRAFT',
            'rkh_date' => $rkh,
            'eta_date' => $eta,
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
        ])->assertCreated();

        $this->assertSame($rkh, substr($res->json('data.rkh_date'), 0, 10));
        $this->assertSame($eta, substr($res->json('data.eta_date'), 0, 10));
        $this->assertDatabaseHas('rencana_kirim', [
            'po_transporter' => 'PO-ETA-1',
            'rkh_date' => $rkh.' 00:00:00',
            'eta_date' => $eta.' 00:00:00',
        ]);
    }

    public function test_rencana_tiba_tidak_boleh_sebelum_rkh(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'PO-ETA-BAD',
            'rkh_date' => now()->addDays(3)->toDateString(),
            'eta_date' => now()->addDay()->toDateString(),
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
        ])->assertStatus(422)->assertJsonValidationErrors(['eta_date']);
    }

    public function test_tidak_bisa_dijadwalkan_tanpa_rencana_tiba(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-ETA-SCHED', 'status' => 'DRAFT',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'created_by' => $user->id,
            'rkh_date' => now()->addDay()->toDateString(),
        ]);

        // Simulasikan data lama yang benar-benar belum punya ETA.
        RencanaKirim::whereKey($rk->id)->update(['eta_date' => null]);

        $this->postJson("/api/v1/rencana-kirim/{$rk->id}/schedule")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['eta_date']);
    }

    public function test_bisa_dijadwalkan_setelah_rencana_tiba_diisi(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-ETA-OK', 'status' => 'DRAFT',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'created_by' => $user->id,
            'rkh_date' => now()->addDay()->toDateString(),
            'eta_date' => now()->addDays(2)->toDateString(),
        ]);

        $this->postJson("/api/v1/rencana-kirim/{$rk->id}/schedule")
            ->assertOk()
            ->assertJsonPath('data.status', 'SCHEDULED');
    }

    public function test_index_bisa_difilter_berdasarkan_eta(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        RencanaKirim::create([
            'po_transporter' => 'ETA-FILTER-A', 'status' => 'DRAFT', 'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test', 'created_by' => $user->id,
            'rkh_date' => now()->subDay()->toDateString(),
            'eta_date' => now()->toDateString(),
        ]);
        RencanaKirim::create([
            'po_transporter' => 'ETA-FILTER-B', 'status' => 'DRAFT', 'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test', 'created_by' => $user->id,
            'rkh_date' => now()->subDay()->toDateString(),
            'eta_date' => now()->addDays(4)->toDateString(),
        ]);

        $today = now()->toDateString();
        $this->getJson("/api/v1/rencana-kirim?eta_from={$today}&eta_to={$today}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.po_transporter', 'ETA-FILTER-A');
    }

    public function test_index_bisa_difilter_eta_terlewat_belum_checkin(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        RencanaKirim::create([
            'po_transporter' => 'OVERDUE-FILTER', 'status' => 'DRAFT', 'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test', 'created_by' => $user->id,
            'rkh_date' => now()->subDays(4)->toDateString(),
            'eta_date' => now()->subDays(2)->toDateString(),
        ]);
        RencanaKirim::create([
            'po_transporter' => 'ON-TIME-FILTER', 'status' => 'DRAFT', 'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test', 'created_by' => $user->id,
            'rkh_date' => now()->toDateString(),
            'eta_date' => now()->addDay()->toDateString(),
        ]);

        $this->getJson('/api/v1/rencana-kirim?eta_overdue=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.po_transporter', 'OVERDUE-FILTER');
    }

    public function test_index_menandai_item_yang_belum_terhubung_npn(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-TANPA-NPN', 'status' => 'DRAFT', 'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test', 'created_by' => $user->id,
            'rkh_date' => now()->toDateString(),
        ]);
        RencanaKirimItem::create([
            'rencana_kirim_id' => $rk->id, 'item_number' => 1,
            'kode_barang' => 'BELUM-ADA', 'nama_barang' => 'Barang', 'jumlah' => 1, 'npn_id' => null,
        ]);

        $res = $this->getJson('/api/v1/rencana-kirim')->assertOk();
        $row = collect($res->json('data'))->firstWhere('id', $rk->id);

        $this->assertSame(1, $row['items_tanpa_npn']);
    }

    public function test_backfill_menghubungkan_kode_barang_ke_master_npn(): void
    {
        $user = $this->viewer();
        $npn = Npn::create([
            'BOSnetszProductId' => 'BOS-BACKFILL', 'SAPszProductId' => 'SAP-BACKFILL',
            'szNickName' => 'Produk Backfill', 'szStatus' => 'EXISTING',
            'decVolume' => 100, 'SAPdecUom' => 10,
        ]);
        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-BACKFILL', 'status' => 'DRAFT', 'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test', 'created_by' => $user->id,
        ]);
        $item = RencanaKirimItem::create([
            'rencana_kirim_id' => $rk->id, 'item_number' => 1,
            'kode_barang' => 'BOS-BACKFILL', 'nama_barang' => 'Produk Backfill',
            'jumlah' => 2, 'npn_id' => null,
        ]);

        $migration = require database_path('migrations/2026_11_20_155738_backfill_rencana_kirim_item_npn.php');
        $migration->up();

        $this->assertSame($npn->id, $item->fresh()->npn_id);
    }

    public function test_index_menerima_eta_overdue_string_true_dari_query(): void
    {
        $user = $this->viewer();
        Sanctum::actingAs($user);

        RencanaKirim::create([
            'po_transporter' => 'OVERDUE-TRUE', 'status' => 'DRAFT', 'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test', 'created_by' => $user->id,
            'rkh_date' => now()->subDays(4)->toDateString(),
            'eta_date' => now()->subDays(2)->toDateString(),
        ]);

        $this->getJson('/api/v1/rencana-kirim?eta_overdue=true')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.po_transporter', 'OVERDUE-TRUE');
    }

    private function viewer(): User
    {
        $role = Role::firstOrCreate(['slug' => 'rk_filter_view'], ['name' => 'RK Filter View']);
        foreach (['rencana_kirim.view', 'rencana_kirim.create', 'rencana_kirim.edit', 'depot.view_all'] as $slug) {
            $perm = Permission::firstOrCreate(
                ['slug' => $slug],
                ['name' => $slug, 'menu_group' => 'Rencana Kirim']
            );
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'rk-filter-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'RK Filter User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }
}
