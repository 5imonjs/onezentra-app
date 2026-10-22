<?php

namespace Tests\Feature;

use App\Imports\UserImport;
use App\Models\Npn;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StateGuardTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string $email, array $perms, string $level = 'operator'): User
    {
        $role = Role::firstOrCreate(['slug' => 'sg_'.$email], ['name' => 'SG '.$email]);
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => $email,
            'password' => 'password',
            'full_name' => 'SG '.$email,
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => $level,
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function rencana(string $status, string $noDokumen = 'SJ-SG-01'): RencanaKirim
    {
        $npn = Npn::create(['szNickName' => 'Produk SG', 'BOSnetszProductId' => 'B-SG-01', 'szStatus' => 'EXISTING']);
        $rk = RencanaKirim::create([
            'po_transporter' => $noDokumen,
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'status' => $status,
            'created_by' => 1,
        ]);
        RencanaKirimItem::create([
            'rencana_kirim_id' => $rk->id,
            'npn_id' => $npn->id,
            'item_number' => 1,
            'kode_barang' => 'B-SG-01',
            'nama_barang' => 'Produk SG',
            'jumlah' => 5,
            'satuan' => 'CRT',
        ]);

        return $rk;
    }

    public function test_receiving_requires_verified_status(): void
    {
        $user = $this->userWith('recv@example.com', ['receiving.create', 'receiving.view']);
        Sanctum::actingAs($user);
        $rk = $this->rencana('DRAFT');

        $this->postJson('/api/v1/receivings', ['rencana_kirim_id' => $rk->id])
            ->assertStatus(422);
    }

    public function test_receiving_rejects_duplicate_active(): void
    {
        $user = $this->userWith('recv2@example.com', ['receiving.create', 'receiving.view']);
        Sanctum::actingAs($user);
        $rk = $this->rencana('VERIFIED');

        $this->postJson('/api/v1/receivings', ['rencana_kirim_id' => $rk->id])->assertCreated();
        $this->postJson('/api/v1/receivings', ['rencana_kirim_id' => $rk->id])->assertStatus(422);
    }

    public function test_gate_inbound_duplicate_rejected(): void
    {
        $user = $this->userWith('gate@example.com', ['gate.create', 'gate.view']);
        Sanctum::actingAs($user);
        $rk = $this->rencana('SCHEDULED');

        $this->postJson('/api/v1/gate-transactions', [
            'rencana_kirim_id' => $rk->id, 'gate_type' => 'INBOUND',
        ])->assertCreated();
        $this->postJson('/api/v1/gate-transactions', [
            'rencana_kirim_id' => $rk->id, 'gate_type' => 'INBOUND',
        ])->assertStatus(422);
    }

    public function test_sj_scan_refused_after_complete(): void
    {
        $user = $this->userWith('sj@example.com', ['sj_validation.create', 'sj_validation.validate', 'sj_validation.complete', 'sj_validation.view']);
        Sanctum::actingAs($user);
        $rk = $this->rencana('CHECKED_IN');

        $start = $this->postJson("/api/v1/sj-validations/start/{$rk->id}")->assertOk();
        $validationId = $start->json('data.id');
        $itemId = $start->json('data.items.0.id');

        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $itemId,
            'kode_barang' => 'B-SG-01',
            'actual_qty' => 5,
            'expired_date' => '2027-01-31',
        ])->assertOk();

        $this->postJson("/api/v1/sj-validations/{$validationId}/complete")->assertOk();

        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $itemId,
            'kode_barang' => 'B-SG-01',
            'actual_qty' => 5,
        ])->assertStatus(422);
    }

    public function test_user_import_blocks_privilege_escalation(): void
    {
        $actor = $this->userWith('actor@example.com', ['users.import']);
        $victim = $this->userWith('victim@example.com', []);

        $import = new UserImport($actor);
        $import->collection(new Collection([[
            'email' => 'victim@example.com',
            'full_name' => 'Victim',
            'level' => 'admin_master',
            'status' => 'active',
        ]]));

        $this->assertSame(0, $import->updated);
        $this->assertSame('operator', $victim->fresh()->level);
    }

    public function test_npn_bulk_destroy_caps_ids(): void
    {
        $user = $this->userWith('npn@example.com', ['npn.delete', 'npn.view']);
        Sanctum::actingAs($user);
        $npn = Npn::create(['szNickName' => 'Bulk SG', 'BOSnetszProductId' => 'B-BULK', 'szStatus' => 'EXISTING']);

        $this->postJson('/api/v1/npn/bulk-delete', ['ids' => array_fill(0, 501, $npn->id)])
            ->assertStatus(422);
    }
}
