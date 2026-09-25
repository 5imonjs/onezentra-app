<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GateCheckinLookupTest extends TestCase
{
    use RefreshDatabase;

    private function gateUser(): User
    {
        $role = Role::firstOrCreate(['slug' => 'gate_lookup'], ['name' => 'Gate Lookup']);
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
            'email' => 'gate-lookup-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Gate Lookup',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_lookup_by_dokumen_reachable_before_show_route(): void
    {
        $user = $this->gateUser();
        $po = 'PO-LOOKUP-'.uniqid();
        RencanaKirim::create([
            'po_transporter' => $po,
            'status' => 'SCHEDULED',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        // Regresi: rute ini pernah tertutup /{gateTransaction} → 404 binding.
        $res = $this->getJson('/api/v1/gate-transactions/search/by-dokumen?po_transporter='.$po);
        $res->assertOk();
        $this->assertSame($po, $res->json('data.po_transporter'));

        $missing = $this->getJson('/api/v1/gate-transactions/search/by-dokumen?po_transporter=PO-TIDAK-ADA');
        $missing->assertNotFound();
    }
}
