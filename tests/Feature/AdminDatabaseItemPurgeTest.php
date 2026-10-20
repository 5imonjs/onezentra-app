<?php

namespace Tests\Feature;

use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDetail;
use App\Models\BiayaThl;
use App\Models\DepotSetting;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminDatabaseItemPurgeTest extends TestCase
{
    use RefreshDatabase;

    private function master(): User
    {
        $purge = Permission::firstOrCreate(
            ['slug' => 'database.purge'],
            ['name' => 'Reset Data Operasional', 'menu_group' => 'Sistem']
        );
        $viewAll = Permission::firstOrCreate(
            ['slug' => 'depot.view_all'],
            ['name' => 'Akses Semua Depo', 'menu_group' => 'Umum']
        );

        $role = Role::firstOrCreate(
            ['slug' => 'item_purge_master'],
            ['name' => 'Item Purge Master', 'is_active' => true]
        );
        $role->permissions()->syncWithoutDetaching([$purge->id, $viewAll->id]);

        $user = User::factory()->create(['level' => 'admin_master', 'status' => 'active']);
        $user->roles()->attach($role->id);

        return $user;
    }

    private function depot(string $kode, string $nama = 'Depo Test'): DepotSetting
    {
        return DepotSetting::create([
            'kode_depo' => $kode,
            'nama_depo' => $nama,
            'is_active' => true,
        ]);
    }

    private function rencana(string $kodeDepo, string $po): RencanaKirim
    {
        return RencanaKirim::factory()->create([
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'po_transporter' => $po,
        ]);
    }

    private function receiving(RencanaKirim $rencana): Receiving
    {
        return Receiving::create(['rencana_kirim_id' => $rencana->id]);
    }

    private function receivingItem(Receiving $receiving, string $kodeDepo): ReceivingItem
    {
        return ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'kode_depo' => $kodeDepo,
            'kode_barang' => 'BRG-1',
            'nama_barang' => 'Barang',
            'condition' => 'FISIK_BAGUS',
            'source' => ReceivingItem::SOURCE_IMPORT,
        ]);
    }

    private function thl(string $kodeDepo, string $noSuratJalan, ?int $detailId = null): BiayaThl
    {
        return BiayaThl::create([
            'tanggal_pengajuan' => now()->toDateString(),
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'no_surat_jalan' => $noSuratJalan,
            'no_kendaraan' => 'B 1234 XX',
            'status' => 'draft',
            'biaya_retribusi_detail_id' => $detailId,
        ]);
    }

    private function retribusi(string $kodeDepo): BiayaRetribusi
    {
        return BiayaRetribusi::create([
            'tanggal_pengajuan' => now()->toDateString(),
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'status' => 'draft',
        ]);
    }

    private function retribusiDetail(BiayaRetribusi $retribusi, ?int $receivingId = null, string $sj = 'SJ-1'): BiayaRetribusiDetail
    {
        return BiayaRetribusiDetail::create([
            'biaya_retribusi_id' => $retribusi->id,
            'receiving_id' => $receivingId,
            'no_surat_jalan' => $sj,
            'nominal_biaya' => 0,
            'order' => 0,
            'kubikasi' => 0,
            'kendaraan_tambahan' => false,
            'qty_zak' => 0,
            'qty_crt' => 0,
        ]);
    }

    private function gate(RencanaKirim $rencana, string $status = 'PENDING'): int
    {
        return DB::table('gate_transactions')->insertGetId([
            'rencana_kirim_id' => $rencana->id,
            'gate_type' => 'INBOUND',
            'po_transporter' => $rencana->po_transporter,
            'status' => $status,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_documents_rencana_hanya_depo_terpilih_dan_bisa_dicari_po(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');
        $this->rencana('DPO-A', 'PO-A-1');
        $this->rencana('DPO-A', 'PO-A-2');
        $this->rencana('DPO-B', 'PO-B-1');

        Sanctum::actingAs($this->master());

        $this->getJson('/api/v1/admin/database/documents?kode_depo=DPO-A&module=rencana_kirim')
            ->assertOk()
            ->assertJsonPath('kode_depo', 'DPO-A')
            ->assertJsonCount(2, 'data');

        $this->getJson('/api/v1/admin/database/documents?kode_depo=DPO-A&module=rencana_kirim&search=PO-A-2')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.label', 'PO-A-2');
    }

    public function test_documents_biaya_thl_bisa_dicari_no_surat_jalan_dan_po_terkait(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');

        $rencana = $this->rencana('DPO-A', 'PO-THL-1');
        $receiving = $this->receiving($rencana);
        $retribusi = $this->retribusi('DPO-A');
        $detail = $this->retribusiDetail($retribusi, $receiving->id);
        $thl = $this->thl('DPO-A', 'SJ-THL-1', $detail->id);
        $other = $this->thl('DPO-B', 'SJ-THL-1');

        Sanctum::actingAs($this->master());

        $this->getJson('/api/v1/admin/database/documents?kode_depo=DPO-A&module=biaya-thl&search=SJ-THL-1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $thl->id);

        $this->getJson('/api/v1/admin/database/documents?kode_depo=DPO-A&module=biaya-thl&search=PO-THL-1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $thl->id)
            ->assertJsonPath('data.0.subtitle', 'B 1234 XX · PO: PO-THL-1');

        $this->assertNotSame($thl->id, $other->id);
    }

    public function test_purge_items_rencana_terpilih_hanya_menghapus_dokumen_itu(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');

        $selected = $this->rencana('DPO-A', 'PO-SELECTED');
        $selectedReceiving = $this->receiving($selected);
        $this->receivingItem($selectedReceiving, 'DPO-A');
        $kept = $this->rencana('DPO-A', 'PO-KEPT');
        $keptReceiving = $this->receiving($kept);
        $this->receivingItem($keptReceiving, 'DPO-A');
        $otherDepot = $this->rencana('DPO-B', 'PO-OTHER');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge-items', [
            'kode_depo' => 'DPO-A',
            'module' => 'rencana_kirim',
            'ids' => [$selected->id],
            'confirm' => 'HAPUS',
        ])
            ->assertOk()
            ->assertJsonPath('data.deleted.rencana_kirim', 1)
            ->assertJsonPath('data.deleted.receivings', 1);

        $this->assertDatabaseMissing('rencana_kirim', ['id' => $selected->id]);
        $this->assertDatabaseMissing('receivings', ['id' => $selectedReceiving->id]);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $kept->id]);
        $this->assertDatabaseHas('receivings', ['id' => $keptReceiving->id]);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $otherDepot->id]);
    }

    public function test_purge_items_biaya_thl_terpilih_hanya_menghapus_dokumen_itu(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');

        $selected = $this->thl('DPO-A', 'SJ-SELECTED');
        $kept = $this->thl('DPO-A', 'SJ-KEPT');
        $otherDepot = $this->thl('DPO-B', 'SJ-OTHER');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge-items', [
            'kode_depo' => 'DPO-A',
            'module' => 'biaya-thl',
            'ids' => [$selected->id],
            'confirm' => 'HAPUS',
        ])->assertOk()->assertJsonPath('data.deleted.biaya_thls', 1);

        $this->assertDatabaseMissing('biaya_thls', ['id' => $selected->id]);
        $this->assertDatabaseHas('biaya_thls', ['id' => $kept->id]);
        $this->assertDatabaseHas('biaya_thls', ['id' => $otherDepot->id]);
    }

    public function test_purge_items_menolak_id_dari_depo_lain_tanpa_menghapus_apa_pun(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');
        $own = $this->rencana('DPO-A', 'PO-OWN');
        $other = $this->rencana('DPO-B', 'PO-OTHER');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge-items', [
            'kode_depo' => 'DPO-A',
            'module' => 'rencana_kirim',
            'ids' => [$own->id, $other->id],
            'confirm' => 'HAPUS',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('ids');

        $this->assertDatabaseHas('rencana_kirim', ['id' => $own->id]);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $other->id]);
    }

    public function test_purge_items_dry_run_dan_konfirmasi_wajib(): void
    {
        $this->depot('DPO-A');
        $rencana = $this->rencana('DPO-A', 'PO-DRY');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge-items', [
            'kode_depo' => 'DPO-A',
            'module' => 'rencana_kirim',
            'ids' => [$rencana->id],
            'confirm' => 'HAPUS',
            'dry_run' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.counts.rencana_kirim', 1);

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencana->id]);

        $this->postJson('/api/v1/admin/database/purge-items', [
            'kode_depo' => 'DPO-A',
            'module' => 'rencana_kirim',
            'ids' => [$rencana->id],
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('confirm');

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencana->id]);
    }

    public function test_purge_items_receiving_terpilih_tidak_menghapus_rencana(): void
    {
        $this->depot('DPO-A');
        $rencana = $this->rencana('DPO-A', 'PO-RECEIVING');
        $receiving = $this->receiving($rencana);

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge-items', [
            'kode_depo' => 'DPO-A',
            'module' => 'receiving',
            'ids' => [$receiving->id],
            'confirm' => 'HAPUS',
        ])->assertOk()->assertJsonPath('data.deleted.receivings', 1);

        $this->assertDatabaseMissing('receivings', ['id' => $receiving->id]);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencana->id]);
    }

    public function test_purge_items_gate_terpilih_tidak_menghapus_gate_lain(): void
    {
        $this->depot('DPO-A');
        $rencana = $this->rencana('DPO-A', 'PO-GATE');
        $selected = $this->gate($rencana);
        $kept = $this->gate($rencana);

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge-items', [
            'kode_depo' => 'DPO-A',
            'module' => 'gate',
            'ids' => [$selected],
            'confirm' => 'HAPUS',
        ])->assertOk()->assertJsonPath('data.deleted.gate_transactions', 1);

        $this->assertDatabaseMissing('gate_transactions', ['id' => $selected]);
        $this->assertDatabaseHas('gate_transactions', ['id' => $kept]);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencana->id]);
    }

    public function test_purge_items_retribusi_terpilih_menghapus_thl_turunan(): void
    {
        $this->depot('DPO-A');
        $retribusi = $this->retribusi('DPO-A');
        $detail = $this->retribusiDetail($retribusi);
        $thl = $this->thl('DPO-A', 'SJ-TURUNAN', $detail->id);

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge-items', [
            'kode_depo' => 'DPO-A',
            'module' => 'biaya-retribusi',
            'ids' => [$retribusi->id],
            'confirm' => 'HAPUS',
        ])->assertOk()->assertJsonPath('data.deleted.biaya_thl_terdampak', 1);

        $this->assertDatabaseMissing('biaya_retribusis', ['id' => $retribusi->id]);
        $this->assertDatabaseMissing('biaya_retribusi_details', ['id' => $detail->id]);
        $this->assertDatabaseMissing('biaya_thls', ['id' => $thl->id]);
    }

    public function test_purge_items_menolak_modul_di_luar_allowlist(): void
    {
        $this->depot('DPO-A');
        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge-items', [
            'kode_depo' => 'DPO-A',
            'module' => 'users',
            'ids' => [1],
            'confirm' => 'HAPUS',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('module');
    }
}
