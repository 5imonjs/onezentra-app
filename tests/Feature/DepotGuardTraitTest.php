<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Payung untuk `AuthorizesDepotRow`.
 *
 * TUJUAN: membuktikan bahwa memindahkan `abort_unless()` dari controller ke
 * trait TIDAK mengubah perilaku. Setiap test punya dua sisi:
 *
 *   - user depo LAIN harus dapat 403
 *   - user depo SENDIRI harus LOLOS (bukan 403)
 *
 * Sisi kedua biasanya hilang saat refactor authorization: guard yang terlalu
 * ketat membuat user sah kehilangan akses — lebih sulit terdeteksi daripada
 * bug "semua orang bisa lihat" yang biasanya lebih cepat ketahuan.
 *
 * Kalau trait dihapus atau diubah, test ini harus tetap hijau pada perilaku
 * yang sama.
 */
class DepotGuardTraitTest extends TestCase
{
    use RefreshDatabase;

    private function depotUser(string $kodeDepo, array $perms): User
    {
        $role = Role::firstOrCreate(['slug' => 'guard_'.$kodeDepo], ['name' => 'Guard '.$kodeDepo, 'slug' => 'guard_'.$kodeDepo]);
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug]);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => strtolower($kodeDepo).'-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'User '.$kodeDepo,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user->fresh()->load('roles');
    }

    /**
     * Status default DRAFT, bukan SCHEDULED.
     *
     * RencanaKirimController@destroy menolak status selain DRAFT/CANCELLED
     * dengan 422, dan pemeriksaan itu terjadi SESUDAH authorizeDepot(). Kalau
     * test memakai SCHEDULED, ia mengukur validasi status, bukan guard depo:
     * respons 422 datang untuk alasan yang salah dan test tidak membuktikan
     * apa pun soal scoping.
     */
    private function rencana(string $kodeDepo, string $po, string $status = 'DRAFT'): RencanaKirim
    {
        return RencanaKirim::create([
            'po_transporter' => $po,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'status' => $status,
        ]);
    }

    // ------------------------------------------------------------------
    // RencanaKirim
    // ------------------------------------------------------------------

    public function test_rencana_kirim_destroy_menolak_depo_lain(): void
    {
        Sanctum::actingAs($this->depotUser('AA', ['rencana_kirim.delete']));
        $rk = $this->rencana('BB', 'PO-RK-1');

        $this->deleteJson("/api/v1/rencana-kirim/{$rk->id}")->assertStatus(403);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id]);
    }

    public function test_rencana_kirim_destroy_mengizinkan_depo_sendiri(): void
    {
        Sanctum::actingAs($this->depotUser('AA', ['rencana_kirim.delete']));
        $rk = $this->rencana('AA', 'PO-RK-2');

        $this->deleteJson("/api/v1/rencana-kirim/{$rk->id}")->assertOk();
        $this->assertDatabaseMissing('rencana_kirim', ['id' => $rk->id]);
    }

    // ------------------------------------------------------------------
    // Receiving
    // ------------------------------------------------------------------

    public function test_receiving_destroy_menolak_depo_lain(): void
    {
        Sanctum::actingAs($this->depotUser('AA', ['receiving.delete']));
        $receiving = Receiving::create([
            'rencana_kirim_id' => $this->rencana('BB', 'PO-RC-1')->id,
            'po_transporter' => 'PO-RC-1',
            'status' => 'PENDING',
        ]);

        $this->deleteJson("/api/v1/receivings/{$receiving->id}")->assertStatus(403);
        $this->assertDatabaseHas('receivings', ['id' => $receiving->id]);
    }

    public function test_receiving_destroy_mengizinkan_depo_sendiri(): void
    {
        Sanctum::actingAs($this->depotUser('AA', ['receiving.delete']));
        $receiving = Receiving::create([
            'rencana_kirim_id' => $this->rencana('AA', 'PO-RC-2')->id,
            'po_transporter' => 'PO-RC-2',
            'status' => 'PENDING',
        ]);

        $this->deleteJson("/api/v1/receivings/{$receiving->id}")->assertOk();
        $this->assertDatabaseMissing('receivings', ['id' => $receiving->id]);
    }

    // ------------------------------------------------------------------
    // Batch
    // ------------------------------------------------------------------

    public function test_batch_menolak_depo_lain(): void
    {
        Sanctum::actingAs($this->depotUser('AA', ['receiving.view']));
        $receiving = Receiving::create([
            'rencana_kirim_id' => $this->rencana('BB', 'PO-BT-1')->id,
            'po_transporter' => 'PO-BT-1',
            'status' => 'PENDING',
        ]);
        $batch = Batch::create([
            'receiving_id' => $receiving->id,
            'batch_number' => 'B-001',
            'status' => 'PENDING',
        ]);

        $this->getJson("/api/v1/batches/search/by-number?batch_number={$batch->batch_number}")->assertStatus(403);
    }

    public function test_batch_mengizinkan_depo_sendiri(): void
    {
        Sanctum::actingAs($this->depotUser('AA', ['receiving.view']));
        $receiving = Receiving::create([
            'rencana_kirim_id' => $this->rencana('AA', 'PO-BT-2')->id,
            'po_transporter' => 'PO-BT-2',
            'status' => 'PENDING',
        ]);
        $batch = Batch::create([
            'receiving_id' => $receiving->id,
            'batch_number' => 'B-002',
            'status' => 'PENDING',
        ]);

        $this->getJson("/api/v1/batches/search/by-number?batch_number={$batch->batch_number}")->assertOk();
    }

    // ------------------------------------------------------------------
    // RencanaKirim (update guard)
    // ------------------------------------------------------------------

    /**
     * Guard pada jalur update: user depo lain harus ditolak SEBELUM ada
     * perubahan tersimpan. Destroy sudah dicakup test di atas; jalur update
     * memakai `authorizeDepot()` yang sama tetapi validasi isi body bisa
     * menutupinya dengan 422 kalau urutannya salah.
     */
    public function test_rencana_kirim_update_menolak_depo_lain(): void
    {
        Sanctum::actingAs($this->depotUser('AA', ['rencana_kirim.edit']));
        $rk = $this->rencana('BB', 'PO-RK-3');

        $this->putJson("/api/v1/rencana-kirim/{$rk->id}", ['po_transporter' => 'PO-DIUBAH'])->assertStatus(403);

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'po_transporter' => 'PO-RK-3']);
    }

    // ------------------------------------------------------------------
    // User
    // ------------------------------------------------------------------

    private function targetUser(string $kodeDepo): User
    {
        return User::create([
            'email' => 'target-'.strtolower($kodeDepo).'-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Target '.$kodeDepo,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
    }

    public function test_user_destroy_menolak_depo_lain(): void
    {
        Sanctum::actingAs($this->depotUser('AA', ['users.delete']));
        $target = $this->targetUser('BB');

        $this->deleteJson("/api/v1/users/{$target->id}")->assertStatus(403);

        $this->assertDatabaseHas('users', ['id' => $target->id]);
    }

    public function test_user_destroy_mengizinkan_depo_sendiri(): void
    {
        Sanctum::actingAs($this->depotUser('AA', ['users.delete']));
        $target = $this->targetUser('AA');

        $this->deleteJson("/api/v1/users/{$target->id}")->assertOk();

        $this->assertDatabaseMissing('users', ['id' => $target->id]);
    }
}
