<?php

namespace Tests\Feature;

use App\Mail\ReceivingCompleted;
use App\Models\EmailRecipient;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\Role;
use App\Models\User;
use App\Services\OpnameExpiredService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Celah potensi pada alur Rencana Kirim → Gate → Validasi SJ → Receiving.
 *
 * Tiap test mereproduksi satu bug/inkonsistensi antar-tahap — bukan happy
 * path (itu sudah dicakup FullFlowTest / LoginToCompleteFlowTest):
 *
 * 1. complete() dari rencana yang sudah CHECKED_IN harus mendorong rencana
 *    ke VERIFIED; kalau tidak, receiving auto sudah lahir tetapi rencana
 *    tertinggal dan alur macet setelah receiving dibatalkan.
 * 2. completeReceiving dipanggil ulang tetap mengirim email notifikasi.
 * 3. ReceivingController::store menyalin item dengan actual_qty tapi
 *    mengeset total_received_qty dari expected → header salah saat selisih.
 * 4. deleteItem pada sesi COMPLETED memutus link receiving_items
 *    (FK nullOnDelete) tanpa menghapus/menghitung ulang barisnya.
 * 5. update() rencana kirim tetap mengizinkan edit items selama sesi
 *    validasi IN_PROGRESS (snapshot acuan bisa berubah di tengah jalan).
 * 6. received_qty diincrement saat scan receiving tapi tidak pernah
 *    disetel ulang saat receiving dibatalkan.
 */
class SupplyChainGapTest extends TestCase
{
    use RefreshDatabase;

    private function userWithPermissions(array $slugs): User
    {
        $role = Role::firstOrCreate(['slug' => '_gap_admin'], ['name' => 'Gap Admin']);
        foreach ($slugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Flow Gap']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'gap-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Gap Test User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'scope_level' => 'master',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        Sanctum::actingAs($user);

        return $user;
    }

    /** Rencana kirim CHECKED_IN + satu item, dibuat langsung via model. */
    private function scheduledRencana(User $user, string $po): RencanaKirim
    {
        $rk = RencanaKirim::create([
            'po_transporter' => $po,
            'rkh_date' => now()->toDateString(),
            'status' => 'CHECKED_IN',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);

        RencanaKirimItem::create([
            'rencana_kirim_id' => $rk->id,
            'item_number' => 1,
            'kode_barang' => 'SKU-GAP-1',
            'nama_barang' => 'Barang Gap',
            'jumlah' => 100,
            'satuan' => 'CRT',
            'created_by' => $user->id,
        ]);

        return $rk->refresh();
    }

    /**
     * Celah 1: validasi yang diselesaikan setelah gate check-in harus
     * mendorong rencana ke VERIFIED — kalau tidak, receiving auto sudah lahir
     * tetapi rencana tertinggal dan alur macet setelah receiving dibatalkan.
     */
    public function test_complete_after_gate_checkin_advances_rencana_and_unblocks_receiving(): void
    {
        $user = $this->userWithPermissions([
            'sj_validation.create', 'sj_validation.validate', 'sj_validation.complete',
            'receiving.create', 'receiving.view', 'receiving.edit',
        ]);
        $rk = $this->scheduledRencana($user, 'PO-GAP-001');

        $start = $this->postJson("/api/v1/sj-validations/start/{$rk->id}")->assertOk();
        $validationId = $start->json('data.id');
        $itemId = $start->json('data.items.0.id');

        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 100,
            'expired_date' => '2027-01-31',
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();

        $this->postJson("/api/v1/sj-validations/{$validationId}/complete")->assertOk();

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'VERIFIED']);

        // Receiving auto dibuat saat complete; kalau dibatalkan, rencana
        // harus mundur ke VERIFIED supaya receiving baru bisa dibuat ulang.
        $receiving = Receiving::where('rencana_kirim_id', $rk->id)->firstOrFail();
        $this->postJson("/api/v1/receivings/{$receiving->id}/cancel")->assertOk();
        $this->postJson('/api/v1/receivings', ['rencana_kirim_id' => $rk->id])->assertCreated();
    }

    /**
     * Celah 2: panggilan kedua completeReceiving (double-tap operator /
     * retry jaringan) tidak boleh mengirim ulang email "Receiving selesai".
     */
    public function test_complete_receiving_called_twice_sends_single_email(): void
    {
        Mail::fake();
        EmailRecipient::create([
            'document_type' => 'receiving',
            'trigger' => 'completed',
            'recipient_type' => 'email',
            'field' => 'TO',
            'email' => 'ops@example.com',
            'is_active' => true,
        ]);

        $user = $this->userWithPermissions(['receiving.create', 'receiving.view', 'receiving.edit']);
        $rk = $this->scheduledRencana($user, 'PO-GAP-002');
        $rk->update(['status' => 'VERIFIED']);

        $receivingId = $this->postJson('/api/v1/receivings', ['rencana_kirim_id' => $rk->id])
            ->assertCreated()
            ->json('data.id');

        $this->postJson("/api/v1/receivings/{$receivingId}/complete", ['barcode' => 'po-gap-002'])->assertOk();
        // Panggilan ulang dijawab sukses (idempoten) tapi tidak boleh kirim email lagi.
        $this->postJson("/api/v1/receivings/{$receivingId}/complete", ['barcode' => 'PO-GAP-002'])->assertOk();

        Mail::assertSent(ReceivingCompleted::class, 1);
    }

    /**
     * Celah 3: store() yang menyalin hasil validasi (actual_qty) setelah
     * receiving auto dibatalkan harus mengeset total_received_qty dari
     * baris item yang tersalin, bukan dari expected (jumlah rencana).
     */
    public function test_receiving_store_copies_total_from_validation_items(): void
    {
        $user = $this->userWithPermissions([
            'sj_validation.create', 'sj_validation.validate', 'sj_validation.complete',
            'receiving.create', 'receiving.view', 'receiving.edit',
        ]);
        $rk = $this->scheduledRencana($user, 'PO-GAP-003');

        $start = $this->postJson("/api/v1/sj-validations/start/{$rk->id}")->assertOk();
        $validationId = $start->json('data.id');
        $itemId = $start->json('data.items.0.id');

        // Selisih: rencana 100, kenyataan 80.
        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 80,
            'expired_date' => '2027-01-31',
            'condition' => 'QTY_KURANG',
            'photo' => UploadedFile::fake()->image('gap.jpg'),
        ])->assertOk();
        $this->postJson("/api/v1/sj-validations/{$validationId}/complete")->assertOk();

        // Batalkan receiving auto, lalu buat ulang lewat store() — jalur yang
        // menyalin latestValidation COMPLETED.
        $auto = Receiving::where('rencana_kirim_id', $rk->id)->firstOrFail();
        $this->postJson("/api/v1/receivings/{$auto->id}/cancel")->assertOk();

        $receivingId = $this->postJson('/api/v1/receivings', ['rencana_kirim_id' => $rk->id])
            ->assertCreated()
            ->json('data.id');

        $receiving = Receiving::findOrFail($receivingId);
        $this->assertEquals(80, (float) $receiving->total_received_qty, 'total_received_qty harus mengikuti actual hasil validasi (80), bukan expected (100)');
        $this->assertEquals(
            (float) $receiving->items()->sum('actual_qty'),
            (float) $receiving->total_received_qty,
            'header harus sama dengan jumlah baris item'
        );
    }

    /**
     * Celah 4: menghapus item validasi pada sesi COMPLETED (koreksi) harus
     * ikut menghapus baris receiving_items yang menunjuknya — kalau hanya
     * link-nya diputus (FK nullOnDelete), tabel receiving tetap menyimpan
     * line yang sudah tidak ada di dokumen validasi.
     */
    public function test_delete_item_on_completed_session_removes_linked_receiving_item(): void
    {
        $user = $this->userWithPermissions([
            'sj_validation.create', 'sj_validation.validate', 'sj_validation.complete',
            'sj_validation.delete', 'sj_validation.edit_completed',
        ]);
        $rk = $this->scheduledRencana($user, 'PO-GAP-004');

        $start = $this->postJson("/api/v1/sj-validations/start/{$rk->id}")->assertOk();
        $validationId = $start->json('data.id');
        $itemId = $start->json('data.items.0.id');

        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 100,
            'expired_date' => '2027-01-31',
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();
        $this->postJson("/api/v1/sj-validations/{$validationId}/complete")->assertOk();

        $receivingItem = ReceivingItem::where('sj_validation_item_id', $itemId)->firstOrFail();

        $this->deleteJson("/api/v1/sj-validations/{$validationId}/items/{$itemId}")->assertOk();

        $this->assertDatabaseMissing('receiving_items', ['id' => $receivingItem->id]);

        $receiving = Receiving::where('rencana_kirim_id', $rk->id)->firstOrFail();
        $this->assertEquals(
            (float) $receiving->items()->sum('actual_qty'),
            (float) $receiving->total_received_qty,
            'total_received_qty harus dihitung ulang setelah baris ikut terhapus'
        );
    }

    /**
     * Celah 5: rencana kirim tidak boleh diedit selama ada sesi validasi
     * IN_PROGRESS — items adalah snapshot acuan cheker; edit (delete-all +
     * insert ulang) di tengah validasi membuat acuan berubah diam-diam.
     */
    public function test_update_rencana_is_blocked_while_validation_in_progress(): void
    {
        $user = $this->userWithPermissions(['rencana_kirim.edit', 'sj_validation.create']);
        $rk = $this->scheduledRencana($user, 'PO-GAP-005');

        $this->postJson("/api/v1/sj-validations/start/{$rk->id}")->assertOk();

        $this->putJson("/api/v1/rencana-kirim/{$rk->id}", ['driver_name' => 'Driver Baru'])
            ->assertStatus(422);

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'driver_name' => null]);
    }

    /**
     * Celah 6: received_qty (diincrement tiap scan receiving) harus
     * disetel ulang saat receiving dibatalkan — kalau tidak, receiving
     * berikutnya mulai dari angka sisa dan double count.
     */
    public function test_cancel_receiving_resets_rencana_received_qty(): void
    {
        $user = $this->userWithPermissions(['receiving.create', 'receiving.view', 'receiving.edit']);
        $rk = $this->scheduledRencana($user, 'PO-GAP-006');
        $rk->update(['status' => 'VERIFIED']);
        $rkItemId = RencanaKirimItem::where('rencana_kirim_id', $rk->id)->first()->id;

        $receivingId = $this->postJson('/api/v1/receivings', ['rencana_kirim_id' => $rk->id])
            ->assertCreated()
            ->json('data.id');

        $this->postJson("/api/v1/receivings/{$receivingId}/start")->assertOk();
        $this->postJson("/api/v1/receivings/{$receivingId}/scan", [
            'kode_barang' => 'SKU-GAP-1',
            'actual_qty' => 5,
            'rencana_kirim_item_id' => $rkItemId,
        ])->assertCreated();

        $this->assertEquals(5, (float) RencanaKirimItem::findOrFail($rkItemId)->received_qty);

        $this->postJson("/api/v1/receivings/{$receivingId}/cancel")->assertOk();

        $this->assertEquals(
            0,
            (float) RencanaKirimItem::findOrFail($rkItemId)->received_qty,
            'received_qty harus kembali 0 setelah receiving dibatalkan (scan-nya ikut batal)'
        );
    }

    /**
     * Celah 7: scan receiving (jalur tanpa validasi SJ) harus menangkap
     * expired_date dan menerbitkan satu batch untuk baris ledger-nya. Tanpa
     * expired_date, baris hasil scan tidak pernah masuk kandidat opname
     * (OpnameExpiredService menyaring whereNotNull('expired_date')); tanpa
     * batch, baris tidak punya label audit.
     */
    public function test_scan_receiving_captures_expiry_and_issues_batch(): void
    {
        $user = $this->userWithPermissions(['receiving.create', 'receiving.view', 'receiving.edit']);
        $rk = $this->scheduledRencana($user, 'PO-GAP-007');
        $rk->update(['status' => 'VERIFIED']);
        $rkItemId = RencanaKirimItem::where('rencana_kirim_id', $rk->id)->first()->id;

        $receivingId = $this->postJson('/api/v1/receivings', ['rencana_kirim_id' => $rk->id])
            ->assertCreated()
            ->json('data.id');

        $this->postJson("/api/v1/receivings/{$receivingId}/start")->assertOk();
        $this->postJson("/api/v1/receivings/{$receivingId}/scan", [
            'kode_barang' => 'SKU-GAP-1',
            'actual_qty' => 5,
            'expired_date' => '2027-02-01',
            'rencana_kirim_item_id' => $rkItemId,
        ])->assertCreated();

        $item = ReceivingItem::where('receiving_id', $receivingId)
            ->where('kode_barang', 'SKU-GAP-1')
            ->whereNotNull('scan_time')
            ->firstOrFail();

        $this->assertSame('2027-02-01', $item->expired_date?->toDateString());
        $this->assertDatabaseHas('batches', ['receiving_item_id' => $item->id]);
    }

    /**
     * Celah 8: baris fallback di ReceivingController::store (tanpa validasi
     * SJ) belum berlabel; store harus tetap menerbitkan satu batch agar
     * aturan "tiap baris ledger tepat satu batch" tidak bocor.
     */
    public function test_store_issues_batch_for_fallback_items(): void
    {
        $user = $this->userWithPermissions(['receiving.create', 'receiving.view']);
        $rk = $this->scheduledRencana($user, 'PO-GAP-008');
        $rk->update(['status' => 'VERIFIED']);
        $rkItemId = RencanaKirimItem::where('rencana_kirim_id', $rk->id)->first()->id;

        $receivingId = $this->postJson('/api/v1/receivings', ['rencana_kirim_id' => $rk->id])
            ->assertCreated()
            ->json('data.id');

        $item = ReceivingItem::where('receiving_id', $receivingId)
            ->where('rencana_kirim_item_id', $rkItemId)
            ->firstOrFail();

        $this->assertDatabaseHas('batches', ['receiving_item_id' => $item->id]);
    }

    /**
     * Celah 9: baris fallback receiving (tanpa validasi SJ) tidak punya
     * expired_date sehingga tak terlihat opname. Sesuai keputusan, baris
     * tetap dibuat sebagai placeholder, dan operator melengkapi expired-nya
     * lewat Edit Inbound — setelah itu baris WAJIB terlihat sebagai kandidat
     * opname (sumber kebenaran tetap receiving_items).
     */
    public function test_fallback_receiving_item_becomes_opname_eligible_after_expiry_edit(): void
    {
        $user = $this->userWithPermissions([
            'receiving.create', 'receiving.view', 'receiving.edit', 'penerimaan.edit',
        ]);
        $rk = $this->scheduledRencana($user, 'PO-GAP-009');
        $rk->update(['status' => 'VERIFIED']);
        $rkItemId = RencanaKirimItem::where('rencana_kirim_id', $rk->id)->first()->id;

        $receivingId = $this->postJson('/api/v1/receivings', ['rencana_kirim_id' => $rk->id])
            ->assertCreated()
            ->json('data.id');

        $item = ReceivingItem::where('receiving_id', $receivingId)
            ->where('rencana_kirim_item_id', $rkItemId)
            ->firstOrFail();

        // Placeholder tanpa expired: belum kandidat opname.
        $this->assertNull($item->expired_date);
        $this->assertSame(0, app(OpnameExpiredService::class)->pendingSummary(now(), $user)['pending']['total']);

        $this->putJson("/api/v1/receiving-items/{$item->id}", ['expired_date' => '2027-02-01'])->assertOk();

        $this->assertSame('2027-02-01', $item->fresh()->expired_date?->toDateString());
        // Setelah expired diisi lewat Edit Inbound, baris terlihat opname.
        $this->assertSame(1, app(OpnameExpiredService::class)->pendingSummary(now(), $user)['pending']['total']);
    }
}
