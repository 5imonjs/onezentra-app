<?php

namespace Tests\Feature;

use App\Models\GateTransaction;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Kontrak: riwayat gate (check-in point) wajib bisa difilter per depo —
 * master melihat per depo via filter, user scoped terkunci ke depo sendiri.
 * Kartu statistik mengikuti filter yang sama.
 */
class GateDepotFilterTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(bool $viewAll, string $depo = 'DPO-A'): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'gate_depot_'.($viewAll ? 'all' : 'scoped').'_'.$depo],
            ['name' => 'Gate Depot']
        );
        $slugs = ['gate.view'];
        if ($viewAll) {
            $slugs[] = 'depot.view_all';
        }
        foreach ($slugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Gate']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'gate-depot-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Gate Depot User',
            'kode_depo' => $depo,
            'nama_depo' => 'Depo '.$depo,
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function makeCheckedIn(string $kodeDepo, User $creator): RencanaKirim
    {
        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-GATE-'.uniqid(),
            'status' => 'CHECKED_IN',
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'created_by' => $creator->id,
        ]);
        GateTransaction::create([
            'rencana_kirim_id' => $rk->id,
            'gate_type' => 'INBOUND',
            'scan_time' => now(),
            'status' => 'COMPLETED',
        ]);

        return $rk;
    }

    public function test_master_filters_gate_history_and_stats_by_depo(): void
    {
        $master = $this->userWith(true);
        $this->makeCheckedIn('DPO-A', $master);
        $this->makeCheckedIn('DPO-B', $master);

        Sanctum::actingAs($master);

        $this->getJson('/api/v1/gate-transactions')->assertOk()->assertJsonPath('total', 2);
        $this->getJson('/api/v1/gate-transactions?kode_depo=DPO-A')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.rencana_kirim.kode_depo', 'DPO-A');

        $this->getJson('/api/v1/gate-transactions/stats')->assertOk()->assertJsonPath('data.total', 2);
        $this->getJson('/api/v1/gate-transactions/stats?kode_depo=DPO-B')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.terjadwal', 0);
    }

    public function test_scoped_user_locked_to_own_depo(): void
    {
        $master = $this->userWith(true);
        $this->makeCheckedIn('DPO-A', $master);
        $this->makeCheckedIn('DPO-B', $master);

        Sanctum::actingAs($this->userWith(false, 'DPO-A'));

        $this->getJson('/api/v1/gate-transactions')->assertOk()->assertJsonPath('total', 1);
        // Filter ke depo lain diabaikan — tetap depo sendiri, bukan data lain.
        $this->getJson('/api/v1/gate-transactions?kode_depo=DPO-B')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.rencana_kirim.kode_depo', 'DPO-A');

        $this->getJson('/api/v1/gate-transactions/stats?kode_depo=DPO-B')
            ->assertOk()
            ->assertJsonPath('data.total', 1);
    }
}
