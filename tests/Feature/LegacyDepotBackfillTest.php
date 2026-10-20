<?php

namespace Tests\Feature;

use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDetail;
use App\Models\BiayaThl;
use App\Models\DepotSetting;
use App\Models\OpnameExpiredSession;
use App\Models\OpnameExpiredWave;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\StandarisasiTumpukan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LegacyDepotBackfillTest extends TestCase
{
    use RefreshDatabase;

    private function master(): User
    {
        $purge = Permission::firstOrCreate(
            ['slug' => 'database.purge'],
            ['name' => 'Reset Data Operasional', 'menu_group' => 'Sistem']
        );

        $role = Role::firstOrCreate(
            ['slug' => 'backfill_master'],
            ['name' => 'Backfill Master', 'is_active' => true]
        );
        $role->permissions()->syncWithoutDetaching([$purge->id]);

        $user = User::factory()->create(['level' => 'admin_master', 'status' => 'active']);
        $user->roles()->attach($role->id);

        return $user;
    }

    private function depot(string $kode, string $nama, bool $active = true): DepotSetting
    {
        return DepotSetting::create([
            'kode_depo' => $kode,
            'nama_depo' => $nama,
            'is_active' => $active,
        ]);
    }

    private function rencana(?string $kodeDepo, ?string $namaDepo): RencanaKirim
    {
        return RencanaKirim::factory()->create([
            'kode_depo' => $kodeDepo,
            'nama_depo' => $namaDepo,
        ]);
    }

    private function receiving(RencanaKirim $rencana): Receiving
    {
        return Receiving::create(['rencana_kirim_id' => $rencana->id]);
    }

    private function receivingItem(Receiving $receiving, ?string $kodeDepo, ?string $namaDepo): ReceivingItem
    {
        return ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'kode_depo' => $kodeDepo,
            'nama_depo' => $namaDepo,
            'kode_barang' => 'BRG-1',
            'nama_barang' => 'Barang',
            'condition' => 'FISIK_BAGUS',
            'source' => ReceivingItem::SOURCE_IMPORT,
        ]);
    }

    private function thl(?string $kodeDepo, ?string $namaDepo, ?int $detailId = null): BiayaThl
    {
        return BiayaThl::create([
            'tanggal_pengajuan' => now()->toDateString(),
            'kode_depo' => $kodeDepo,
            'nama_depo' => $namaDepo,
            'status' => 'draft',
            'biaya_retribusi_detail_id' => $detailId,
        ]);
    }

    private function retribusi(?string $kodeDepo, ?string $namaDepo): BiayaRetribusi
    {
        return BiayaRetribusi::create([
            'tanggal_pengajuan' => now()->toDateString(),
            'kode_depo' => $kodeDepo,
            'nama_depo' => $namaDepo,
            'status' => 'draft',
        ]);
    }

    private function retribusiDetail(BiayaRetribusi $retribusi, ?int $receivingId = null): BiayaRetribusiDetail
    {
        return BiayaRetribusiDetail::create([
            'biaya_retribusi_id' => $retribusi->id,
            'receiving_id' => $receivingId,
            'nominal_biaya' => 0,
            'order' => 0,
            'kubikasi' => 0,
            'kendaraan_tambahan' => false,
            'qty_zak' => 0,
            'qty_crt' => 0,
        ]);
    }

    public function test_preview_secara_default_tidak_mengubah_data(): void
    {
        $this->depot('DPO-A', 'Depo A');
        $rencana = $this->rencana(null, 'Depo A');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/backfill-depot')
            ->assertOk()
            ->assertJsonPath('data.dry_run', true)
            ->assertJsonPath('data.candidates.rencana_kirim.total', 1)
            ->assertJsonPath('data.candidates.rencana_kirim.resolved', 1)
            ->assertJsonPath('data.applied', []);

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencana->id, 'kode_depo' => null]);
    }

    public function test_apply_mengisi_dari_nama_depo_yang_cocok_unik(): void
    {
        $this->depot('DPO-A', 'Depo A');
        $rencana = $this->rencana(null, '  depo a ');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/backfill-depot', [
            'dry_run' => false,
            'confirm' => 'BACKFILL',
        ])
            ->assertOk()
            ->assertJsonPath('data.applied.rencana_kirim', 1);

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencana->id, 'kode_depo' => 'DPO-A']);
    }

    public function test_nama_depo_unik_mengisi_semua_tabel_operasional_lain(): void
    {
        $this->depot('DPO-A', 'Depo A');

        $penerimaanId = DB::table('penerimaan')->insertGetId([
            'kode_depo' => null,
            'nama_depo' => 'Depo A',
        ]);
        $session = OpnameExpiredSession::create([
            'week_start' => now()->startOfWeek()->toDateString(),
            'week_end' => now()->endOfWeek()->toDateString(),
            'kode_depo' => '',
            'nama_depo' => 'Depo A',
            'status' => 'OPEN',
        ]);
        $wave = OpnameExpiredWave::create([
            'week_start' => now()->startOfWeek()->toDateString(),
            'week_end' => now()->endOfWeek()->toDateString(),
            'kode_depo' => null,
            'nama_depo' => 'Depo A',
            'kode_barang' => 'BRG-1',
            'nama_barang' => 'Barang',
            'expired_date_ini' => now()->addMonth()->toDateString(),
            'sisa_hari' => 30,
            'status_ini' => 'AMAN',
        ]);
        $standarisasi = StandarisasiTumpukan::create([
            'kode_depo' => null,
            'nama_depo' => 'Depo A',
            'status' => 'pending',
        ]);

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/backfill-depot', [
            'dry_run' => false,
            'confirm' => 'BACKFILL',
        ])
            ->assertOk()
            ->assertJsonPath('data.applied.penerimaan', 1)
            ->assertJsonPath('data.applied.opname_expired_sessions', 1)
            ->assertJsonPath('data.applied.opname_expired_waves', 1)
            ->assertJsonPath('data.applied.standarisasi_tumpukan', 1);

        $this->assertDatabaseHas('penerimaan', ['id' => $penerimaanId, 'kode_depo' => 'DPO-A']);
        $this->assertDatabaseHas('opname_expired_sessions', ['id' => $session->id, 'kode_depo' => 'DPO-A']);
        $this->assertDatabaseHas('opname_expired_waves', ['id' => $wave->id, 'kode_depo' => 'DPO-A']);
        $this->assertDatabaseHas('standarisasi_tumpukan', ['id' => $standarisasi->id, 'kode_depo' => 'DPO-A']);
    }

    public function test_apply_mengisi_kode_depo_kosong_dari_relasi_receiving(): void
    {
        $this->depot('DPO-A', 'Depo A');
        $rencana = $this->rencana('DPO-A', 'Depo A');
        $receiving = $this->receiving($rencana);
        $item = $this->receivingItem($receiving, null, null);

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/backfill-depot', [
            'dry_run' => false,
            'confirm' => 'BACKFILL',
        ])
            ->assertOk()
            ->assertJsonPath('data.applied.receiving_items', 1);

        $this->assertDatabaseHas('receiving_items', ['id' => $item->id, 'kode_depo' => 'DPO-A']);
    }

    public function test_nama_depo_ambigu_tidak_diisi(): void
    {
        $this->depot('DPO-A', 'Depo Sama');
        $this->depot('DPO-B', 'Depo Sama');
        $rencana = $this->rencana(null, 'Depo Sama');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/backfill-depot', [
            'dry_run' => false,
            'confirm' => 'BACKFILL',
        ])
            ->assertOk()
            ->assertJsonPath('data.candidates.rencana_kirim.resolved', 0)
            ->assertJsonPath('data.candidates.rencana_kirim.unresolved', 1);

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencana->id, 'kode_depo' => null]);
    }

    public function test_relasi_dan_nama_yang_berbeda_tidak_diisi(): void
    {
        $this->depot('DPO-A', 'Depo A');
        $this->depot('DPO-B', 'Depo B');
        $rencana = $this->rencana('DPO-B', 'Depo B');
        $receiving = $this->receiving($rencana);
        $item = $this->receivingItem($receiving, null, 'Depo A');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/backfill-depot', [
            'dry_run' => false,
            'confirm' => 'BACKFILL',
        ])
            ->assertOk()
            ->assertJsonPath('data.candidates.receiving_items.unresolved', 1)
            ->assertJsonPath('data.candidates.receiving_items.unresolved_samples.0.alasan', 'sumber memberi depo berbeda: nama_depo=DPO-A, relasi receiving=DPO-B');

        $this->assertDatabaseHas('receiving_items', ['id' => $item->id, 'kode_depo' => null]);
    }

    public function test_biaya_thl_diisi_dari_detail_retribusi(): void
    {
        $this->depot('DPO-A', 'Depo A');
        $retribusi = $this->retribusi('DPO-A', 'Depo A');
        $detail = $this->retribusiDetail($retribusi);
        $thl = $this->thl(null, null, $detail->id);

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/backfill-depot', [
            'dry_run' => false,
            'confirm' => 'BACKFILL',
        ])
            ->assertOk()
            ->assertJsonPath('data.applied.biaya_thls', 1);

        $this->assertDatabaseHas('biaya_thls', ['id' => $thl->id, 'kode_depo' => 'DPO-A']);
    }

    public function test_biaya_retribusi_diisi_dari_relasi_receiving(): void
    {
        $this->depot('DPO-B', 'Depo B');
        $rencana = $this->rencana('DPO-B', 'Depo B');
        $receiving = $this->receiving($rencana);
        $retribusi = $this->retribusi(null, null);
        $this->retribusiDetail($retribusi, $receiving->id);

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/backfill-depot', [
            'dry_run' => false,
            'confirm' => 'BACKFILL',
        ])
            ->assertOk()
            ->assertJsonPath('data.applied.biaya_retribusis', 1);

        $this->assertDatabaseHas('biaya_retribusis', ['id' => $retribusi->id, 'kode_depo' => 'DPO-B']);
    }

    public function test_tidak_menimpa_kode_depo_yang_sudah_terisi(): void
    {
        $this->depot('DPO-A', 'Depo A');
        $this->depot('DPO-B', 'Depo B');
        $rencana = $this->rencana('DPO-A', 'Depo B');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/backfill-depot', [
            'dry_run' => false,
            'confirm' => 'BACKFILL',
        ])
            ->assertOk()
            ->assertJsonPath('data.candidates.rencana_kirim.total', 0);

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencana->id, 'kode_depo' => 'DPO-A']);
    }

    public function test_depo_nonaktif_tidak_dipakai(): void
    {
        $this->depot('DPO-A', 'Depo A', false);
        $rencana = $this->rencana(null, 'Depo A');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/backfill-depot', [
            'dry_run' => false,
            'confirm' => 'BACKFILL',
        ])
            ->assertOk()
            ->assertJsonPath('data.candidates.rencana_kirim.resolved', 0);

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencana->id, 'kode_depo' => null]);
    }

    public function test_apply_wajib_konfirmasi_backfill(): void
    {
        $this->depot('DPO-A', 'Depo A');
        $rencana = $this->rencana(null, 'Depo A');

        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/backfill-depot', ['dry_run' => false])
            ->assertStatus(422)
            ->assertJsonValidationErrors('confirm');

        $this->postJson('/api/v1/admin/database/backfill-depot', [
            'dry_run' => false,
            'confirm' => 'HAPUS',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('confirm');

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencana->id, 'kode_depo' => null]);
    }

    public function test_non_master_ditolak_walau_punya_permission(): void
    {
        $permission = Permission::firstOrCreate(
            ['slug' => 'database.purge'],
            ['name' => 'Reset Data Operasional', 'menu_group' => 'Sistem']
        );
        $role = Role::firstOrCreate(
            ['slug' => 'backfill_non_master'],
            ['name' => 'Backfill Non Master', 'is_active' => true]
        );
        $role->permissions()->syncWithoutDetaching([$permission->id]);

        $user = User::factory()->create(['level' => 'cheker', 'status' => 'active']);
        $role->users()->attach($user->id);
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/admin/database/backfill-depot')->assertForbidden();
    }
}
