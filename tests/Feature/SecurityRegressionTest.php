<?php

namespace Tests\Feature;

use App\Exports\ReceivingExport;
use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDetail;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Regresi keamanan: eskalasi permission, lintas-depo export, dan
 * double-claim retribusi. Lihat .ai/rules untuk konteks tiap guard.
 */
class SecurityRegressionTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $email, string $roleSlug, string $kodeDepo = 'DEPO-A', string $namaDepo = 'Depo A'): User
    {
        $role = Role::firstOrCreate(['slug' => $roleSlug], [
            'name' => ucfirst($roleSlug),
            'description' => $namaDepo,
        ]);

        $user = User::create([
            'email' => $email,
            'password' => 'password',
            'full_name' => 'User '.$roleSlug,
            'kode_depo' => $kodeDepo,
            'nama_depo' => $namaDepo,
            'level' => $roleSlug,
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function grant(User $user, string $slug): void
    {
        $perm = Permission::firstOrCreate(['slug' => $slug], [
            'name' => ucfirst($slug),
            'menu_group' => 'Test',
        ]);
        $user->roles()->firstOrFail()->permissions()->syncWithoutDetaching([$perm->id]);
    }

    public function test_non_admin_cannot_sync_sensitive_permissions(): void
    {
        $staff = $this->makeUser('staff@test.com', 'staff_logistic');
        $this->grant($staff, 'roles.view');

        $target = Role::firstOrCreate(['slug' => 'target_role'], ['name' => 'Target']);
        $sensitive = Permission::firstOrCreate(['slug' => 'roles.edit'], [
            'name' => 'Roles Edit',
            'menu_group' => 'Test',
        ]);

        Sanctum::actingAs($staff);

        $this->putJson("/api/v1/roles/{$target->id}/permissions", [
            'permission_ids' => [$sensitive->id],
        ])->assertForbidden();

        $this->assertFalse(
            $target->permissions()->whereKey($sensitive->id)->exists(),
            'Permission sensitif tersinkron oleh non-admin.'
        );
    }

    public function test_non_admin_cannot_rename_permission_slug(): void
    {
        $staff = $this->makeUser('staff@test.com', 'staff_logistic');
        $this->grant($staff, 'roles.view');

        $perm = Permission::firstOrCreate(['slug' => 'penerimaan.view'], [
            'name' => 'Penerimaan View',
            'menu_group' => 'Test',
        ]);

        Sanctum::actingAs($staff);

        $this->putJson("/api/v1/permissions/{$perm->id}", [
            'slug' => 'admin_master',
        ])->assertForbidden();

        $this->assertDatabaseHas('permissions', ['id' => $perm->id, 'slug' => 'penerimaan.view']);
    }

    public function test_receiving_export_is_scoped_to_own_depot(): void
    {
        $userA = $this->makeUser('a@depot.test', 'staff_a', 'DEPO-A', 'Depo A');
        $userB = $this->makeUser('b@depot.test', 'staff_b', 'DEPO-B', 'Depo B');
        $this->grant($userA, 'receiving.view');
        $this->grant($userA, 'receiving.export');

        $rkA = RencanaKirim::create([
            'po_transporter' => 'SJ-A', 'kode_depo' => 'DEPO-A', 'nama_depo' => 'Depo A',
            'status' => 'COMPLETED', 'created_by' => $userA->id,
        ]);
        $rkB = RencanaKirim::create([
            'po_transporter' => 'SJ-B', 'kode_depo' => 'DEPO-B', 'nama_depo' => 'Depo B',
            'status' => 'COMPLETED', 'created_by' => $userB->id,
        ]);
        Receiving::create(['rencana_kirim_id' => $rkA->id, 'status' => 'COMPLETED']);
        Receiving::create(['rencana_kirim_id' => $rkB->id, 'status' => 'COMPLETED']);

        Sanctum::actingAs($userA);

        $index = $this->getJson('/api/v1/receivings')->assertOk();
        $this->assertCount(1, $index->json('data'));
        $this->assertEquals('DEPO-A', $index->json('data.0.rencana_kirim.kode_depo'));

        $this->getJson('/api/v1/receivings/export')->assertOk();

        $exported = (new ReceivingExport(user: $userA))->query()->get();
        $this->assertCount(1, $exported);
        $this->assertTrue(
            $exported->every(fn (Receiving $r) => $r->rencanaKirim->kode_depo === 'DEPO-A'),
            'Export receiving membocorkan data depo lain.'
        );
    }

    public function test_double_claim_retribusi_is_rejected(): void
    {
        $user = $this->makeUser('klaim@depot.test', 'staff_logistic');
        $this->grant($user, 'biaya_retribusi.create');

        $rk = RencanaKirim::create([
            'po_transporter' => 'SJ-KLAIM', 'kode_depo' => 'DEPO-A', 'nama_depo' => 'Depo A',
            'jenis_kendaraan' => 'CDD', 'status' => 'COMPLETED', 'created_by' => $user->id,
        ]);
        $receiving = Receiving::create([
            'rencana_kirim_id' => $rk->id, 'status' => 'COMPLETED', 'checked_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $payload = [
            'tanggal_pengajuan' => '2026-10-01',
            'details' => [[
                'receiving_id' => $receiving->id,
                'nopol_kendaraan' => 'KB1234AB',
                'type_kendaraan' => 'CDD',
                'nominal_biaya' => 150000,
            ]],
        ];

        $this->postJson('/api/v1/biaya-retribusi', $payload)->assertCreated();

        $this->postJson('/api/v1/biaya-retribusi', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors('details.0.receiving_id');

        $this->assertEquals(
            1,
            BiayaRetribusiDetail::where('receiving_id', $receiving->id)->count(),
            'Receiving ter-klaim dua kali.'
        );
    }

    /**
     * Backstop level database: kalaupun validasi aplikasi (422 di atas)
     * dilewati — mis. dua request lolos race sebelum commit — unique
     * constraint brd_receiving_id_unique menolak receiving_id ganda.
     * Insert langsung dua baris sama, tanpa request paralel.
     */
    public function test_database_unique_constraint_rejects_duplicate_receiving_claim(): void
    {
        $user = $this->makeUser('backstop@depot.test', 'staff_logistic');

        $rk = RencanaKirim::create([
            'po_transporter' => 'SJ-BACKSTOP', 'kode_depo' => 'DEPO-A', 'nama_depo' => 'Depo A',
            'jenis_kendaraan' => 'CDD', 'status' => 'COMPLETED', 'created_by' => $user->id,
        ]);
        $receiving = Receiving::create([
            'rencana_kirim_id' => $rk->id, 'status' => 'COMPLETED', 'checked_by' => $user->id,
        ]);
        $pengajuan = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-10-01', 'kode_depo' => 'DEPO-A', 'nama_depo' => 'Depo A',
            'created_by' => $user->id,
        ]);

        $row = [
            'biaya_retribusi_id' => $pengajuan->id,
            'receiving_id' => $receiving->id,
            'nominal_biaya' => 150000,
            'created_at' => now(),
            'updated_at' => now(),
        ];
        DB::table('biaya_retribusi_details')->insert($row);

        try {
            DB::table('biaya_retribusi_details')->insert($row);
            $this->fail('Unique constraint brd_receiving_id_unique tidak menolak receiving_id ganda.');
        } catch (QueryException $e) {
            $this->assertStringContainsString(
                '23000',
                $e->getMessage(),
                'Penolakan bukan integrity-constraint violation (SQLSTATE 23000).'
            );
        }

        $this->assertEquals(
            1,
            BiayaRetribusiDetail::where('receiving_id', $receiving->id)->count(),
            'Receiving ter-klaim dua kali di level database.'
        );
    }
}
