<?php

namespace Tests\Feature;

use App\Models\BiayaRetribusi;
use App\Models\BiayaThl;
use App\Models\GateTransaction;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\SjValidation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Regresi filter `kode_depo` pada endpoint list yang dipanggil dashboard
 * (PendingActions & fallback kartu statistik). Sebelumnya hanya
 * rencana-kirim yang mendukung filter ini; endpoint lain mengabaikannya
 * sehingga angka "Perlu Tindakan" user global tidak pernah terfilter depo.
 */
class IndexKodeDepotFilterTest extends TestCase
{
    use RefreshDatabase;

    /** User global (bukan depot-scoped) dengan izin endpoint yang diuji. */
    private function globalUser(string $email, string $perm): User
    {
        $role = Role::firstOrCreate(['slug' => 'depof_'.$perm], ['name' => 'Depo Filter '.$perm]);
        foreach ([$perm, 'depot.view_all'] as $slug) {
            $permission = Permission::firstOrCreate(
                ['slug' => $slug],
                ['name' => $slug, 'menu_group' => 'Test']
            );
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }
        $user = User::create([
            'email' => $email,
            'password' => 'password',
            'full_name' => 'Depo Filter User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    /** @return array{inDepot: RencanaKirim, otherDepot: RencanaKirim} */
    private function twoDepotRencana(string $prefix, int $createdBy): array
    {
        $inDepot = RencanaKirim::create([
            'po_transporter' => $prefix.'-DPO', 'status' => 'DRAFT',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'created_by' => $createdBy,
        ]);
        $otherDepot = RencanaKirim::create([
            'po_transporter' => $prefix.'-LAIN', 'status' => 'DRAFT',
            'kode_depo' => 'LAIN', 'nama_depo' => 'Depo Lain', 'created_by' => $createdBy,
        ]);

        return ['inDepot' => $inDepot, 'otherDepot' => $otherDepot];
    }

    public function test_gate_index_filters_by_kode_depo(): void
    {
        $user = $this->globalUser('gate-depofilter@example.com', 'gate.view');
        Sanctum::actingAs($user);
        $depots = $this->twoDepotRencana('GATE', $user->id);
        GateTransaction::create(['rencana_kirim_id' => $depots['inDepot']->id, 'status' => 'CHECKED_IN', 'scan_time' => now()]);
        GateTransaction::create(['rencana_kirim_id' => $depots['otherDepot']->id, 'status' => 'CHECKED_IN', 'scan_time' => now()]);

        $this->getJson('/api/v1/gate-transactions')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->getJson('/api/v1/gate-transactions?kode_depo=DPO')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.rencana_kirim_id', $depots['inDepot']->id);
    }

    public function test_receivings_index_filters_by_kode_depo(): void
    {
        $user = $this->globalUser('rcv-depofilter@example.com', 'receiving.view');
        Sanctum::actingAs($user);
        $depots = $this->twoDepotRencana('RCV', $user->id);
        Receiving::create(['rencana_kirim_id' => $depots['inDepot']->id, 'status' => 'pending']);
        Receiving::create(['rencana_kirim_id' => $depots['otherDepot']->id, 'status' => 'pending']);

        $this->getJson('/api/v1/receivings')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->getJson('/api/v1/receivings?kode_depo=LAIN')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.rencana_kirim_id', $depots['otherDepot']->id);
    }

    public function test_sj_validations_index_filters_by_kode_depo(): void
    {
        $user = $this->globalUser('sj-depofilter@example.com', 'sj_validation.view');
        Sanctum::actingAs($user);
        $depots = $this->twoDepotRencana('SJV', $user->id);
        SjValidation::create(['rencana_kirim_id' => $depots['inDepot']->id, 'status' => 'IN_PROGRESS']);
        SjValidation::create(['rencana_kirim_id' => $depots['otherDepot']->id, 'status' => 'IN_PROGRESS']);

        $this->getJson('/api/v1/sj-validations')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $res = $this->getJson('/api/v1/sj-validations?kode_depo=DPO')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        // Relasi rencana_kirim membawa kode_depo/nama_depo untuk label grup dashboard.
        $this->assertSame($depots['inDepot']->id, $res->json('data.0.rencana_kirim_id'));
        $this->assertSame('DPO', $res->json('data.0.rencana_kirim.kode_depo'));
        $this->assertSame('Depo Test', $res->json('data.0.rencana_kirim.nama_depo'));
    }

    public function test_biaya_thl_index_filters_by_kode_depo(): void
    {
        $user = $this->globalUser('thl-depofilter@example.com', 'biaya_thl.view');
        Sanctum::actingAs($user);
        BiayaThl::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'status' => 'pending', 'created_by' => $user->id]);
        BiayaThl::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'LAIN', 'nama_depo' => 'Depo Lain', 'status' => 'pending', 'created_by' => $user->id]);

        $this->getJson('/api/v1/biaya-thl')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->getJson('/api/v1/biaya-thl?kode_depo=LAIN')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.kode_depo', 'LAIN');
    }

    public function test_biaya_retribusi_index_filters_by_kode_depo(): void
    {
        $user = $this->globalUser('ret-depofilter@example.com', 'biaya_retribusi.view');
        Sanctum::actingAs($user);
        BiayaRetribusi::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'status' => 'pending', 'created_by' => $user->id]);
        BiayaRetribusi::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'LAIN', 'nama_depo' => 'Depo Lain', 'status' => 'pending', 'created_by' => $user->id]);

        $this->getJson('/api/v1/biaya-retribusi')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->getJson('/api/v1/biaya-retribusi?kode_depo=DPO')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.kode_depo', 'DPO');
    }
}
