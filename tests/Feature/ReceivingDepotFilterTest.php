<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Receiving;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Kontrak: daftar receiving (check-in point) wajib bisa difilter per depo —
 * master melihat per depo via filter, user scoped terkunci ke depo sendiri.
 */
class ReceivingDepotFilterTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(bool $viewAll, string $depo = 'DPO-A'): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'receiving_depot_'.($viewAll ? 'all' : 'scoped')],
            ['name' => 'Receiving Depot']
        );
        $slugs = ['receiving.view'];
        if ($viewAll) {
            $slugs[] = 'depot.view_all';
        }
        foreach ($slugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Receiving']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'receiving-depot-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Receiving Depot User',
            'kode_depo' => $depo,
            'nama_depo' => 'Depo '.$depo,
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function makeReceiving(
        string $kodeDepo,
        User $creator,
        string $status = 'PENDING',
        ?string $po = null,
    ): Receiving {
        $rk = RencanaKirim::create([
            'po_transporter' => $po ?? 'PO-RCV-'.uniqid(),
            'status' => 'CHECKED_IN',
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'created_by' => $creator->id,
        ]);

        return Receiving::create([
            'rencana_kirim_id' => $rk->id,
            'status' => $status,
            'checked_by' => $creator->id,
        ]);
    }

    public function test_master_filters_receiving_by_depo(): void
    {
        $master = $this->userWith(true);
        $this->makeReceiving('DPO-A', $master);
        $this->makeReceiving('DPO-B', $master);

        Sanctum::actingAs($master);

        $this->getJson('/api/v1/receivings')->assertOk()->assertJsonPath('total', 2);
        $this->getJson('/api/v1/receivings?kode_depo=DPO-A')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.rencana_kirim.kode_depo', 'DPO-A');
    }

    public function test_scoped_user_locked_to_own_depo(): void
    {
        $master = $this->userWith(true);
        $this->makeReceiving('DPO-A', $master);
        $this->makeReceiving('DPO-B', $master);

        Sanctum::actingAs($this->userWith(false, 'DPO-A'));

        $this->getJson('/api/v1/receivings')->assertOk()->assertJsonPath('total', 1);
        // Filter ke depo lain diabaikan — tetap depo sendiri.
        $this->getJson('/api/v1/receivings?kode_depo=DPO-B')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.rencana_kirim.kode_depo', 'DPO-A');
    }

    public function test_stats_returns_grouped_counts_for_the_users_depo(): void
    {
        $master = $this->userWith(true);
        $this->makeReceiving('DPO-A', $master, 'PENDING');
        $this->makeReceiving('DPO-A', $master, 'IN_PROGRESS');
        $this->makeReceiving('DPO-A', $master, 'COMPLETED');
        $this->makeReceiving('DPO-B', $master, 'PENDING');

        Sanctum::actingAs($this->userWith(false, 'DPO-A'));

        $this->getJson('/api/v1/receivings/stats')
            ->assertOk()
            ->assertJsonPath('data.total', 3)
            ->assertJsonPath('data.pending', 1)
            ->assertJsonPath('data.in_progress', 1)
            ->assertJsonPath('data.completed', 1);
    }

    public function test_by_po_matches_exactly_and_respects_depot_scope(): void
    {
        $master = $this->userWith(true);
        $exact = $this->makeReceiving('DPO-A', $master, 'IN_PROGRESS', 'PO-EXACT');
        $this->makeReceiving('DPO-A', $master, 'PENDING', 'PO-EXACT-OTHER');

        Sanctum::actingAs($this->userWith(false, 'DPO-A'));

        $this->getJson('/api/v1/receivings/search/by-po?po_transporter=po-exact')
            ->assertOk()
            ->assertJsonPath('data.id', $exact->id)
            ->assertJsonPath('data.status', 'IN_PROGRESS');

        $this->getJson('/api/v1/receivings/search/by-po?po_transporter=PO-EXAC')
            ->assertNotFound();
    }
}
