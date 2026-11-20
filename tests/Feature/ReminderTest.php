<?php

namespace Tests\Feature;

use App\Models\GateTransaction;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\SjValidation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReminderTest extends TestCase
{
    use RefreshDatabase;

    /** @param list<string> $permissions */
    private function userWithPermissions(string $kodeDepo, array $permissions): User
    {
        $role = Role::firstOrCreate(['slug' => 'reminder-'.md5(implode(',', $permissions))], ['name' => 'Reminder Role']);
        foreach ($permissions as $slug) {
            $permission = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug]);
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }

        $user = User::create([
            'email' => 'reminder-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'User Reminder',
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user->fresh();
    }

    /** @param array<string, mixed> $overrides */
    private function rencana(string $kodeDepo, array $overrides = []): RencanaKirim
    {
        return RencanaKirim::create(array_merge([
            'po_transporter' => 'PO-'.$kodeDepo,
            'nopol' => 'B 1234 CD',
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'status' => 'SCHEDULED',
        ], $overrides));
    }

    public function test_reminder_hanya_mengembalikan_proses_yang_melewati_ambang_waktu(): void
    {
        $user = $this->userWithPermissions('DPT-A', [
            'sj_validation.view', 'gate.view', 'rencana_kirim.view', 'rencana_kirim.edit',
        ]);
        Sanctum::actingAs($user);

        $old = now()->subMinutes(45);
        $fresh = now()->subMinutes(5);

        $rkOld = $this->rencana('DPT-A');
        $rkFresh = $this->rencana('DPT-A', ['po_transporter' => 'PO-BARU']);
        SjValidation::create(['rencana_kirim_id' => $rkOld->id, 'status' => 'IN_PROGRESS', 'started_at' => $old]);
        SjValidation::create(['rencana_kirim_id' => $rkFresh->id, 'status' => 'IN_PROGRESS', 'started_at' => $fresh]);
        SjValidation::create(['rencana_kirim_id' => $rkFresh->id, 'status' => 'COMPLETED', 'started_at' => $old]);

        GateTransaction::create(['rencana_kirim_id' => $rkOld->id, 'status' => 'CHECKED_IN', 'nopol' => 'B 1111 AA', 'scan_time' => $old]);
        GateTransaction::create(['rencana_kirim_id' => $rkFresh->id, 'status' => 'CHECKED_IN', 'nopol' => 'B 2222 BB', 'scan_time' => $fresh]);

        $this->rencana('DPT-A', ['po_transporter' => 'PO-RK-LAMA', 'status' => 'CHECKED_IN', 'checked_in_at' => $old]);
        $this->rencana('DPT-A', ['po_transporter' => 'PO-RK-BARU', 'status' => 'CHECKED_IN', 'checked_in_at' => $fresh]);

        $res = $this->getJson('/api/v1/reminders')->assertOk();

        $this->assertSame(30, $res->json('data.threshold_minutes'));
        $this->assertSame(3, $res->json('data.total'));
        $this->assertSame(['sj_validation', 'gate', 'rencana_kirim'], collect($res->json('data.groups'))->pluck('key')->all());

        $sj = $res->json('data.groups.0.items');
        $this->assertCount(1, $sj);
        $this->assertSame('PO-DPT-A', $sj[0]['title']);
        $this->assertGreaterThanOrEqual(30, $sj[0]['elapsed_minutes']);

        $this->assertCount(1, $res->json('data.groups.1.items'));
        $this->assertSame('B 1111 AA', $res->json('data.groups.1.items.0.title'));
        $this->assertCount(1, $res->json('data.groups.2.items'));
        $this->assertSame('PO-RK-LAMA', $res->json('data.groups.2.items.0.title'));
    }

    public function test_reminder_tidak_menampilkan_group_tanpa_permission(): void
    {
        $user = $this->userWithPermissions('DPT-A', ['sj_validation.view']);
        Sanctum::actingAs($user);

        $rk = $this->rencana('DPT-A');
        SjValidation::create(['rencana_kirim_id' => $rk->id, 'status' => 'IN_PROGRESS', 'started_at' => now()->subHour()]);
        GateTransaction::create(['rencana_kirim_id' => $rk->id, 'status' => 'CHECKED_IN', 'scan_time' => now()->subHour()]);

        $res = $this->getJson('/api/v1/reminders')->assertOk();

        $this->assertSame(['sj_validation'], collect($res->json('data.groups'))->pluck('key')->all());
        $this->assertSame(1, $res->json('data.total'));
    }

    public function test_reminder_user_depo_tidak_melihat_data_depo_lain(): void
    {
        $user = $this->userWithPermissions('DPT-A', ['sj_validation.view', 'gate.view', 'rencana_kirim.view', 'rencana_kirim.edit']);
        Sanctum::actingAs($user);

        $rkA = $this->rencana('DPT-A', ['po_transporter' => 'PO-A']);
        $rkB = $this->rencana('DPT-B', ['po_transporter' => 'PO-B']);
        SjValidation::create(['rencana_kirim_id' => $rkA->id, 'status' => 'IN_PROGRESS', 'started_at' => now()->subHour()]);
        SjValidation::create(['rencana_kirim_id' => $rkB->id, 'status' => 'IN_PROGRESS', 'started_at' => now()->subHour()]);
        GateTransaction::create(['rencana_kirim_id' => $rkB->id, 'status' => 'CHECKED_IN', 'nopol' => 'B 9999 ZZ', 'scan_time' => now()->subHour()]);
        $this->rencana('DPT-B', ['po_transporter' => 'PO-RK-B', 'status' => 'CHECKED_IN', 'checked_in_at' => now()->subHour()]);

        $res = $this->getJson('/api/v1/reminders')->assertOk();

        $this->assertSame('PO-A', $res->json('data.groups.0.items.0.title'));
        $this->assertCount(1, $res->json('data.groups.0.items'));
        $this->assertSame([], $res->json('data.groups.1.items') ?? []);
        $this->assertNull($res->json('data.groups.2') ?? null);
    }
}
