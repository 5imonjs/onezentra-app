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

class GateTransactionDateFilterTest extends TestCase
{
    use RefreshDatabase;

    private function viewer(): User
    {
        $role = Role::firstOrCreate(['slug' => 'gate_date_view'], ['name' => 'Gate Date View']);
        $perm = Permission::firstOrCreate(
            ['slug' => 'gate.view'],
            ['name' => 'gate.view', 'menu_group' => 'Gate']
        );
        $viewAll = Permission::firstOrCreate(
            ['slug' => 'depot.view_all'],
            ['name' => 'depot.view_all']
        );
        $role->permissions()->syncWithoutDetaching([$perm->id, $viewAll->id]);

        $user = User::create([
            'email' => 'gate-date-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Gate Date User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function makeRk(User $user): RencanaKirim
    {
        return RencanaKirim::create([
            'po_transporter' => 'PO-GATE-'.uniqid(),
            'status' => 'CHECKED_IN',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);
    }

    public function test_index_filters_by_date_range(): void
    {
        $user = $this->viewer();
        $rk = $this->makeRk($user);

        // Transaksi kemarin, hari ini, dan lusa.
        $yesterday = GateTransaction::create([
            'rencana_kirim_id' => $rk->id,
            'gate_type' => 'INBOUND',
            'scan_time' => now()->subDay(),
            'status' => 'COMPLETED',
        ]);
        $todayTx = GateTransaction::create([
            'rencana_kirim_id' => $rk->id,
            'gate_type' => 'INBOUND',
            'scan_time' => now(),
            'status' => 'COMPLETED',
        ]);
        $tomorrow = GateTransaction::create([
            'rencana_kirim_id' => $rk->id,
            'gate_type' => 'OUTBOUND',
            'scan_time' => now()->addDay(),
            'status' => 'COMPLETED',
        ]);

        Sanctum::actingAs($user);

        // Hanya hari ini.
        $today = now()->toDateString();
        $res = $this->getJson("/api/v1/gate-transactions?date_from={$today}&date_to={$today}")->assertOk();
        $ids = collect($res->json('data'))->pluck('id')->all();
        $this->assertContains($todayTx->id, $ids);
        $this->assertNotContains($yesterday->id, $ids);
        $this->assertNotContains($tomorrow->id, $ids);

        // Rentang kemarin–lusa memuat semuanya.
        $resAll = $this->getJson('/api/v1/gate-transactions?date_from='.now()->subDay()->toDateString().'&date_to='.now()->addDay()->toDateString())->assertOk();
        $this->assertCount(3, $resAll->json('data'));

        // Tanpa filter: semua muncul.
        $resNoFilter = $this->getJson('/api/v1/gate-transactions')->assertOk();
        $this->assertCount(3, $resNoFilter->json('data'));
    }
}
