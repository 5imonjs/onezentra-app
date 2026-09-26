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

    private function gateUser(bool $allDepots = true): User
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
        $role->permissions()->syncWithoutDetaching($allDepots ? [$perm->id, $viewAll->id] : [$perm->id]);

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

    public function test_lookup_by_dokumen_accepts_nopol(): void
    {
        $user = $this->gateUser();
        $nopol = 'B '.uniqid().' AA';

        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-NOPOL-'.uniqid(),
            'nopol' => $nopol,
            'status' => 'SCHEDULED',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        // UI menanyakan "PO / Nopol" — plat kendaraan harus bisa looked up juga.
        $res = $this->getJson('/api/v1/gate-transactions/search/by-dokumen?po_transporter='.urlencode($nopol));
        $res->assertOk();
        $this->assertSame($rencana->id, $res->json('data.id'));
        $this->assertSame($nopol, $res->json('data.nopol'));

        // Trim spasi dari hasil scan keyboard.
        $trimmed = $this->getJson('/api/v1/gate-transactions/search/by-dokumen?po_transporter='.urlencode('  '.$nopol.'  '));
        $trimmed->assertOk();
        $this->assertSame($rencana->id, $trimmed->json('data.id'));
    }

    public function test_lookup_by_dokumen_tidak_menerima_partial_match(): void
    {
        $user = $this->gateUser();

        RencanaKirim::create([
            'po_transporter' => 'PO-ABC-777',
            'nopol' => 'B 1234 CD',
            'status' => 'SCHEDULED',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        // Partial match akan mengembalikan dokumen milik shipment lain, dan
        // dokumen itu bisa langsung di-Gate-IN dari layar. Harus tetap 404.
        $this->getJson('/api/v1/gate-transactions/search/by-dokumen?po_transporter=777')
            ->assertNotFound();
        $this->getJson('/api/v1/gate-transactions/search/by-dokumen?po_transporter=B%201234')
            ->assertNotFound();
    }

    public function test_lookup_by_dokumen_ignores_other_depot(): void
    {
        $user = $this->gateUser(allDepots: false);
        $nopol = 'B '.uniqid().' ZZ';

        RencanaKirim::create([
            'po_transporter' => 'PO-LAIN-'.uniqid(),
            'nopol' => $nopol,
            'status' => 'SCHEDULED',
            'kode_depo' => 'DPO-LAIN',
            'nama_depo' => 'Depo Lain',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/gate-transactions/search/by-dokumen?po_transporter='.urlencode($nopol))
            ->assertNotFound();
    }
}
