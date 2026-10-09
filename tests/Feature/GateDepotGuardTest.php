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
 * Guard depot + status pada tulis/hapus gate: tanpa cek depo (IDOR) dan
 * tanpa pemulihan status rencana (yatim) sebelumnya lolos.
 */
class GateDepotGuardTest extends TestCase
{
    use RefreshDatabase;

    private function gateUser(string $depo, array $extraPerms = []): User
    {
        $role = Role::firstOrCreate(['slug' => 'gate_guard_'.$depo], ['name' => 'Gate Guard '.$depo]);
        foreach (array_merge(['gate.view', 'gate.create', 'gate.edit', 'gate.delete'], $extraPerms) as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'gate-guard-'.$depo.'-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Gate Guard',
            'kode_depo' => $depo,
            'nama_depo' => 'Depo '.$depo,
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_update_and_destroy_other_depot_are_forbidden(): void
    {
        $owner = $this->gateUser('DPO');
        $intruder = $this->gateUser('LAIN');
        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-GATE-'.uniqid(),
            'status' => 'CHECKED_IN',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo DPO',
            'created_by' => $owner->id,
        ]);
        $gate = GateTransaction::create([
            'rencana_kirim_id' => $rencana->id,
            'gate_type' => 'INBOUND',
            'status' => 'CHECKED_IN',
        ]);

        Sanctum::actingAs($intruder);

        $this->putJson("/api/v1/gate-transactions/{$gate->id}", ['notes' => 'x'])->assertForbidden();
        $this->deleteJson("/api/v1/gate-transactions/{$gate->id}")->assertForbidden();
    }

    public function test_destroy_inbound_restores_schedule_and_outbound_is_rejected(): void
    {
        $user = $this->gateUser('DPO');
        Sanctum::actingAs($user);

        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-GATE-'.uniqid(),
            'status' => 'CHECKED_IN',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo DPO',
            'created_by' => $user->id,
        ]);
        $gate = GateTransaction::create([
            'rencana_kirim_id' => $rencana->id,
            'gate_type' => 'INBOUND',
            'status' => 'CHECKED_IN',
        ]);

        $this->deleteJson("/api/v1/gate-transactions/{$gate->id}")->assertOk();
        $this->assertSame('SCHEDULED', $rencana->fresh()->status);
        $this->assertDatabaseMissing('gate_transactions', ['id' => $gate->id]);

        $rencana2 = RencanaKirim::create([
            'po_transporter' => 'PO-GATE-'.uniqid(),
            'status' => 'COMPLETED',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo DPO',
            'created_by' => $user->id,
        ]);
        // Sistem receiving-only: baris legacy bertipe selain INBOUND (dibuat
        // langsung via model, validasi API `in:INBOUND` menolaknya) tetap
        // tidak bisa dihapus -> 422, status rencana tidak berubah.
        $out = GateTransaction::create([
            'rencana_kirim_id' => $rencana2->id,
            'gate_type' => 'OUTBOUND',
            'status' => 'COMPLETED',
        ]);

        $this->deleteJson("/api/v1/gate-transactions/{$out->id}")->assertStatus(422);
        $this->assertSame('COMPLETED', $rencana2->fresh()->status);
    }
}
