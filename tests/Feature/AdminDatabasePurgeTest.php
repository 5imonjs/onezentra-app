<?php

namespace Tests\Feature;

use App\Models\ApprovalHistory;
use App\Models\Batch;
use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDetail;
use App\Models\BiayaRetribusiDocument;
use App\Models\BiayaThl;
use App\Models\BiayaThlDetail;
use App\Models\DepotSetting;
use App\Models\OpnameExpiredSession;
use App\Models\OpnameExpiredSessionItem;
use App\Models\OpnameExpiredWave;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\SjValidation;
use App\Models\StandarisasiTumpukan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminDatabasePurgeTest extends TestCase
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
            ['slug' => 'reset_master'],
            ['name' => 'Reset Master', 'is_active' => true]
        );
        $role->permissions()->syncWithoutDetaching([$purge->id, $viewAll->id]);

        $user = User::factory()->create(['level' => 'admin_master', 'status' => 'active']);
        $user->roles()->attach($role->id);

        return $user;
    }

    private function otherUser(): User
    {
        $role = Role::create(['slug' => 'no_purge', 'name' => 'No Purge', 'is_active' => true]);
        // role_id TIDAK fillable — relasi role hanya lewat pivot role_user.
        $user = User::factory()->create(['level' => 'cheker', 'status' => 'active']);
        $role->users()->attach($user->id);

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

    private function rencana(string $kodeDepo, string $namaDepo = 'Depo Test'): RencanaKirim
    {
        return RencanaKirim::factory()->create([
            'kode_depo' => $kodeDepo,
            'nama_depo' => $namaDepo,
        ]);
    }

    private function rencanaItem(RencanaKirim $rencana): int
    {
        return DB::table('rencana_kirim_items')->insertGetId([
            'rencana_kirim_id' => $rencana->id,
            'item_number' => 1,
            'kode_barang' => 'BRG-1',
            'nama_barang' => 'Barang',
            'jumlah' => 10,
            'received_qty' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function receiving(RencanaKirim $rencana): Receiving
    {
        return Receiving::create(['rencana_kirim_id' => $rencana->id]);
    }

    private function receivingItem(Receiving $receiving, string $kodeDepo, ?string $photo = null): ReceivingItem
    {
        return ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'kode_depo' => $kodeDepo,
            'kode_barang' => 'BRG-1',
            'nama_barang' => 'Barang',
            'condition' => 'FISIK_BAGUS',
            'source' => ReceivingItem::SOURCE_IMPORT,
            'photo' => $photo,
        ]);
    }

    private function batch(array $attributes): Batch
    {
        return Batch::create(array_merge([
            'batch_number' => 'BATCH-'.fake()->unique()->numerify('######'),
            'status' => 'ACTIVE',
        ], $attributes));
    }

    private function validation(RencanaKirim $rencana): SjValidation
    {
        return SjValidation::create([
            'rencana_kirim_id' => $rencana->id,
            'status' => 'COMPLETED',
        ]);
    }

    private function wave(string $kodeDepo, string $kodeBarang = 'BRG-1'): OpnameExpiredWave
    {
        return OpnameExpiredWave::create([
            'week_start' => now()->startOfWeek()->toDateString(),
            'week_end' => now()->endOfWeek()->toDateString(),
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo Test',
            'kode_barang' => $kodeBarang,
            'nama_barang' => 'Barang',
            'expired_date_ini' => now()->addMonth()->toDateString(),
            'sisa_hari' => 30,
            'status_ini' => 'AMAN',
        ]);
    }

    private function opnameSession(string $kodeDepo): OpnameExpiredSession
    {
        return OpnameExpiredSession::create([
            'week_start' => now()->startOfWeek()->toDateString(),
            'week_end' => now()->endOfWeek()->toDateString(),
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo Test',
            'status' => 'OPEN',
        ]);
    }

    private function thl(string $kodeDepo): BiayaThl
    {
        return BiayaThl::create([
            'tanggal_pengajuan' => now()->toDateString(),
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo Test',
            'status' => 'draft',
        ]);
    }

    private function retribusi(string $kodeDepo): BiayaRetribusi
    {
        return BiayaRetribusi::create([
            'tanggal_pengajuan' => now()->toDateString(),
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo Test',
            'status' => 'draft',
        ]);
    }

    public function test_master_melihat_ringkasan_isi_modul_untuk_depo_terpilih(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');
        $this->rencana('DPO-A');
        $this->rencana('DPO-B');

        Sanctum::actingAs($this->master());

        $this->getJson('/api/v1/admin/database/summary?kode_depo=DPO-A')
            ->assertOk()
            ->assertJsonPath('data.rencana_kirim', 1)
            ->assertJsonPath('kode_depo', 'DPO-A')
            ->assertJsonCount(2, 'depots');
    }

    public function test_summary_tanpa_kode_depo_mengembalikan_daftar_depo_dan_default(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');

        Sanctum::actingAs($this->master());

        $this->getJson('/api/v1/admin/database/summary')
            ->assertOk()
            ->assertJsonPath('kode_depo', 'DPO-A')
            ->assertJsonCount(2, 'depots')
            ->assertJsonStructure(['data' => ['rencana_kirim', 'biaya-thl']]);
    }

    public function test_summary_menolak_depo_yang_tidak_dikenal(): void
    {
        $this->depot('DPO-A');
        Sanctum::actingAs($this->master());

        $this->getJson('/api/v1/admin/database/summary?kode_depo=DPO-X')
            ->assertStatus(422)
            ->assertJsonValidationErrors('kode_depo');
    }

    public function test_non_master_ditolak_walau_punya_permission_nyata(): void
    {
        // Level lain tetap 403: controller meng-gate ulang level, bukan
        // sekadar permission — grant manual slug ini via UI tidak membuka purge.
        $user = $this->otherUser();
        $role = Role::where('slug', 'no_purge')->firstOrFail();
        $role->permissions()->attach(
            Permission::firstOrCreate(
                ['slug' => 'database.purge'],
                ['name' => 'Reset', 'menu_group' => 'Sistem']
            )->id
        );

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/admin/database/summary')->assertForbidden();
        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['rencana_kirim'], 'confirm' => 'HAPUS',
        ])->assertForbidden();
    }

    public function test_purge_wajib_depo_dan_konfirmasi_teks(): void
    {
        $this->depot('DPO-A');
        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'modules' => ['rencana_kirim'], 'confirm' => 'HAPUS',
        ])->assertStatus(422)->assertJsonValidationErrors('kode_depo');

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['rencana_kirim'], 'confirm' => 'YA',
        ])->assertStatus(422)->assertJsonValidationErrors('confirm');

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['tabel_rahasia'], 'confirm' => 'HAPUS',
        ])->assertStatus(422)->assertJsonValidationErrors('modules.0');
    }

    public function test_dry_run_hanya_menghitung_depo_terpilih_tanpa_menghapus(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');
        $rencanaA = $this->rencana('DPO-A');
        $rencanaB = $this->rencana('DPO-B');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['rencana_kirim'], 'confirm' => 'HAPUS', 'dry_run' => true,
        ])->assertOk()
            ->assertJsonPath('data.counts.rencana_kirim', 1)
            ->assertJsonPath('data.kode_depo', 'DPO-A');

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencanaA->id]);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencanaB->id]);
    }

    public function test_reset_rencana_kirim_hanya_menghapus_rangkaian_depo_terpilih(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');

        foreach (['DPO-A', 'DPO-B'] as $kodeDepo) {
            $rencana = $this->rencana($kodeDepo);
            $itemId = $this->rencanaItem($rencana);
            $gateId = DB::table('gate_transactions')->insertGetId([
                'rencana_kirim_id' => $rencana->id,
                'gate_type' => 'INBOUND',
                'status' => 'COMPLETED',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $validation = $this->validation($rencana);
            DB::table('sj_validation_items')->insert([
                'sj_validation_id' => $validation->id,
                'rencana_kirim_item_id' => $itemId,
                'expected_qty' => 10,
                'actual_qty' => 10,
                'condition' => 'FISIK_BAGUS',
                'status' => 'MATCHED',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $receiving = $this->receiving($rencana);
            $receiving->update(['gate_transaction_id' => $gateId]);
            $this->receivingItem($receiving, $kodeDepo);
            $this->batch(['receiving_id' => $receiving->id]);
        }

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['rencana_kirim'], 'confirm' => 'HAPUS',
        ])->assertOk();

        $this->assertSame(0, RencanaKirim::where('kode_depo', 'DPO-A')->count());
        $this->assertSame(1, RencanaKirim::where('kode_depo', 'DPO-B')->count());
        $this->assertSame(1, Receiving::count());
        $this->assertSame(1, ReceivingItem::count());
        $this->assertSame(1, Batch::count());
        $this->assertSame(1, DB::table('gate_transactions')->count());
        $this->assertSame(1, SjValidation::count());
    }

    public function test_reset_validasi_sj_menghapus_batch_validasi_depo_terpilih_saja(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');

        $batchIds = [];
        foreach (['DPO-A', 'DPO-B'] as $kodeDepo) {
            $rencana = $this->rencana($kodeDepo);
            $itemId = $this->rencanaItem($rencana);
            $validation = $this->validation($rencana);
            $validationItemId = DB::table('sj_validation_items')->insertGetId([
                'sj_validation_id' => $validation->id,
                'rencana_kirim_item_id' => $itemId,
                'expected_qty' => 10,
                'actual_qty' => 10,
                'condition' => 'FISIK_BAGUS',
                'status' => 'MATCHED',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $batchIds[$kodeDepo] = $this->batch(['sj_validation_item_id' => $validationItemId])->id;
        }

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['validasi-sj'], 'confirm' => 'HAPUS',
        ])->assertOk();

        $this->assertDatabaseMissing('batches', ['id' => $batchIds['DPO-A']]);
        $this->assertDatabaseHas('batches', ['id' => $batchIds['DPO-B']]);
        $this->assertSame(1, SjValidation::count());
    }

    public function test_reset_receiving_depo_terpilih_tidak_menyentuh_depo_lain(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');

        $rencanaA = $this->rencana('DPO-A');
        $receivingA = $this->receiving($rencanaA);
        $this->receivingItem($receivingA, 'DPO-A');
        $this->batch(['receiving_id' => $receivingA->id]);

        $rencanaB = $this->rencana('DPO-B');
        $receivingB = $this->receiving($rencanaB);
        $this->receivingItem($receivingB, 'DPO-B');
        $this->batch(['receiving_id' => $receivingB->id]);

        $retribusi = $this->retribusi('DPO-A');
        $detail = BiayaRetribusiDetail::create([
            'biaya_retribusi_id' => $retribusi->id,
            'receiving_id' => $receivingA->id,
            'nominal_biaya' => 0,
            'order' => 0,
            'kubikasi' => 0,
            'kendaraan_tambahan' => false,
            'qty_zak' => 0,
            'qty_crt' => 0,
        ]);

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['receiving'], 'confirm' => 'HAPUS',
        ])->assertOk();

        $this->assertDatabaseMissing('receivings', ['id' => $receivingA->id]);
        $this->assertDatabaseHas('receivings', ['id' => $receivingB->id]);
        $this->assertDatabaseHas('receiving_items', ['receiving_id' => $receivingB->id]);
        $this->assertSame(1, Batch::count());
        // Klaim biaya tidak dihapus, referensinya saja yang dilepas.
        $this->assertDatabaseHas('biaya_retribusi_details', [
            'id' => $detail->id,
            'receiving_id' => null,
        ]);
        // Rencana induk tetap ada karena modul receiving saja yang dipilih.
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencanaA->id]);
    }

    public function test_reset_penerimaan_dan_opname_hanya_depo_terpilih(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');

        foreach (['DPO-A', 'DPO-B'] as $kodeDepo) {
            DB::table('penerimaan')->insert([
                'tanggal_penerimaan' => now()->toDateString(),
                'no_shipment' => 'SJ-'.$kodeDepo,
                'kode_depo' => $kodeDepo,
                'status' => 'COMPLETED',
                'created_at' => now(),
            ]);
            $session = $this->opnameSession($kodeDepo);
            $wave = $this->wave($kodeDepo, 'BRG-'.$kodeDepo);
            OpnameExpiredSessionItem::create([
                'session_id' => $session->id,
                'wave_id' => $wave->id,
            ]);
        }

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['penerimaan', 'opname-session'], 'confirm' => 'HAPUS',
        ])->assertOk();

        $this->assertDatabaseMissing('penerimaan', ['kode_depo' => 'DPO-A']);
        $this->assertDatabaseHas('penerimaan', ['kode_depo' => 'DPO-B']);
        $this->assertSame(1, OpnameExpiredSession::count());
        $this->assertSame(1, OpnameExpiredSessionItem::count());
        $this->assertSame(2, OpnameExpiredWave::count());
    }

    public function test_reset_wave_batch_expired_menghapus_item_sesi_wave_terpilih(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');

        $sessionA = $this->opnameSession('DPO-A');
        $waveA = $this->wave('DPO-A', 'BRG-A');
        OpnameExpiredSessionItem::create(['session_id' => $sessionA->id, 'wave_id' => $waveA->id]);

        $sessionB = $this->opnameSession('DPO-B');
        $waveB = $this->wave('DPO-B', 'BRG-B');
        OpnameExpiredSessionItem::create(['session_id' => $sessionB->id, 'wave_id' => $waveB->id]);

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['opname-wave'], 'confirm' => 'HAPUS',
        ])->assertOk();

        $this->assertDatabaseMissing('opname_expired_waves', ['id' => $waveA->id]);
        $this->assertDatabaseHas('opname_expired_waves', ['id' => $waveB->id]);
        $this->assertDatabaseMissing('opname_expired_session_items', ['wave_id' => $waveA->id]);
        // Sesi induk tidak ikut dihapus.
        $this->assertDatabaseHas('opname_expired_sessions', ['id' => $sessionA->id]);
    }

    public function test_reset_standarisasi_hanya_depo_terpilih(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');

        $a = StandarisasiTumpukan::create(['kode_depo' => 'DPO-A', 'status' => 'pending']);
        $b = StandarisasiTumpukan::create(['kode_depo' => 'DPO-B', 'status' => 'pending']);

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['standarisasi'], 'confirm' => 'HAPUS',
        ])->assertOk();

        $this->assertDatabaseMissing('standarisasi_tumpukan', ['id' => $a->id]);
        $this->assertDatabaseHas('standarisasi_tumpukan', ['id' => $b->id]);
    }

    public function test_reset_biaya_thl_menghapus_detail_dan_riwayat_depo_terpilih(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');

        $thlA = $this->thl('DPO-A');
        $detailA = BiayaThlDetail::create([
            'biaya_thl_id' => $thlA->id,
            'kubikasi' => 0,
            'nominal_biaya' => 0,
            'kendaraan_tambahan' => false,
            'order' => 0,
        ]);
        ApprovalHistory::create([
            'subject_type' => BiayaThl::class,
            'subject_id' => $thlA->id,
            'to_status' => 'submitted',
            'action' => 'submit',
        ]);

        $thlB = $this->thl('DPO-B');
        $detailB = BiayaThlDetail::create([
            'biaya_thl_id' => $thlB->id,
            'kubikasi' => 0,
            'nominal_biaya' => 0,
            'kendaraan_tambahan' => false,
            'order' => 0,
        ]);

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['biaya-thl'], 'confirm' => 'HAPUS',
        ])->assertOk();

        $this->assertDatabaseMissing('biaya_thls', ['id' => $thlA->id]);
        $this->assertDatabaseMissing('biaya_thl_details', ['id' => $detailA->id]);
        $this->assertDatabaseMissing('approval_histories', ['subject_id' => $thlA->id]);
        $this->assertDatabaseHas('biaya_thls', ['id' => $thlB->id]);
        $this->assertDatabaseHas('biaya_thl_details', ['id' => $detailB->id]);
    }

    public function test_reset_biaya_retribusi_menghapus_dokumen_dan_thl_turunan_depo_terpilih(): void
    {
        $this->depot('DPO-A');
        $this->depot('DPO-B');

        $retribusiA = $this->retribusi('DPO-A');
        $detailA = BiayaRetribusiDetail::create([
            'biaya_retribusi_id' => $retribusiA->id,
            'nominal_biaya' => 0,
            'order' => 0,
            'kubikasi' => 0,
            'kendaraan_tambahan' => false,
            'qty_zak' => 0,
            'qty_crt' => 0,
        ]);
        BiayaRetribusiDocument::create([
            'biaya_retribusi_id' => $retribusiA->id,
            'file_path' => 'biaya_retribusi/a.pdf',
            'file_name' => 'a.pdf',
            'file_size' => 10,
            'order' => 0,
        ]);
        $thlTurunan = $this->thl('DPO-A');
        $thlTurunan->update(['biaya_retribusi_detail_id' => $detailA->id]);
        ApprovalHistory::create([
            'subject_type' => BiayaRetribusi::class,
            'subject_id' => $retribusiA->id,
            'to_status' => 'submitted',
            'action' => 'submit',
        ]);
        ApprovalHistory::create([
            'subject_type' => BiayaThl::class,
            'subject_id' => $thlTurunan->id,
            'to_status' => 'submitted',
            'action' => 'submit',
        ]);

        $retribusiB = $this->retribusi('DPO-B');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['biaya-retribusi'], 'confirm' => 'HAPUS',
        ])->assertOk();

        $this->assertDatabaseMissing('biaya_retribusis', ['id' => $retribusiA->id]);
        $this->assertDatabaseMissing('biaya_retribusi_details', ['id' => $detailA->id]);
        $this->assertDatabaseMissing('biaya_retribusi_documents', ['biaya_retribusi_id' => $retribusiA->id]);
        $this->assertDatabaseMissing('biaya_thls', ['id' => $thlTurunan->id]);
        $this->assertDatabaseMissing('approval_histories', ['subject_id' => $retribusiA->id]);
        $this->assertDatabaseMissing('approval_histories', ['subject_id' => $thlTurunan->id]);
        $this->assertDatabaseHas('biaya_retribusis', ['id' => $retribusiB->id]);
    }

    public function test_reset_menghapus_file_yang_tidak_lagi_direferensikan(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('validation-photos/a.jpg', 'x');

        $this->depot('DPO-A');
        $rencana = $this->rencana('DPO-A');
        $receiving = $this->receiving($rencana);
        $this->receivingItem($receiving, 'DPO-A', 'validation-photos/a.jpg');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['receiving'], 'confirm' => 'HAPUS',
        ])->assertOk()->assertJsonPath('data.deleted.files', 1);

        Storage::disk('public')->assertMissing('validation-photos/a.jpg');
    }

    public function test_file_foto_validasi_tetap_ada_bila_masih_dipakai_receiving_item(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('validation-photos/shared.jpg', 'x');

        $this->depot('DPO-A');
        $rencana = $this->rencana('DPO-A');
        $itemId = $this->rencanaItem($rencana);
        $validation = $this->validation($rencana);
        DB::table('sj_validation_items')->insert([
            'sj_validation_id' => $validation->id,
            'rencana_kirim_item_id' => $itemId,
            'expected_qty' => 10,
            'actual_qty' => 10,
            'condition' => 'FISIK_BAGUS',
            'status' => 'MATCHED',
            'photo' => 'validation-photos/shared.jpg',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $receiving = $this->receiving($rencana);
        $this->receivingItem($receiving, 'DPO-A', 'validation-photos/shared.jpg');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'kode_depo' => 'DPO-A', 'modules' => ['validasi-sj'], 'confirm' => 'HAPUS',
        ])->assertOk();

        // Baris receiving masih memakai file yang sama — jangan hapus.
        Storage::disk('public')->assertExists('validation-photos/shared.jpg');
    }
}
