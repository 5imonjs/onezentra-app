<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Receiving;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\Role;
use App\Models\SjValidation;
use App\Models\SjValidationItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SjValidationFlowTest extends TestCase
{
    use RefreshDatabase;

    private function userWithPermissions(array $slugs): User
    {
        $role = Role::firstOrCreate(['slug' => '_admin'], ['name' => 'Admin', 'slug' => '_admin']);
        foreach ($slugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Validasi Dokumen']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'sj-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'SJ Test User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    /**
     * Rencana kirim SCHEDULED + snapshot item, dibuat langsung via model.
     */
    private function scheduledRencana(User $user): RencanaKirim
    {
        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-SJ-'.uniqid(),
            'rkh_date' => now()->toDateString(),
            'status' => 'SCHEDULED',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);

        RencanaKirimItem::create([
            'rencana_kirim_id' => $rk->id,
            'item_number' => 1,
            'kode_barang' => 'SKU-SJ-1',
            'nama_barang' => 'Barang SJ',
            'jumlah' => 100,
            'satuan' => 'CRT',
            'created_by' => $user->id,
        ]);

        return $rk->refresh();
    }

    public function test_stats_counts_are_global_per_depot(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view']));
        $rk = $this->scheduledRencana($user);

        SjValidation::create(['rencana_kirim_id' => $rk->id, 'validated_by' => $user->id, 'scan_code' => $rk->po_transporter, 'status' => 'COMPLETED', 'started_at' => now()]);
        SjValidation::create(['rencana_kirim_id' => $rk->id, 'validated_by' => $user->id, 'scan_code' => $rk->po_transporter, 'status' => 'CANCELLED', 'started_at' => now()]);

        $data = $this->getJson('/api/v1/sj-validations/stats')->assertOk()->json('data');

        $this->assertSame(2, $data['total']);
        $this->assertSame(1, $data['completed']);
        $this->assertSame(1, $data['cancelled']);
        $this->assertSame(0, $data['in_progress']);
        $this->assertSame(2, $data['today']);
        $this->assertArrayNotHasKey('pending', $data); // level PENDING tidak ada di validasi
    }

    public function test_start_by_code_creates_validation_with_item_snapshot(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.create']));
        $rk = $this->scheduledRencana($user);

        $res = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])
            ->assertOk()
            ->json('data');

        $this->assertSame('IN_PROGRESS', $res['status']);
        $this->assertCount(1, $res['items']);
        $this->assertSame('SKU-SJ-1', $res['items'][0]['kode_barang']);
        $this->assertSame('PENDING', $res['items'][0]['status']);

        // Scan ulang kode yang sama → lanjutkan validasi yang ada (tidak dobel).
        $res2 = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])
            ->assertOk()
            ->json('data');
        $this->assertSame($res['id'], $res2['id']);
        $this->assertSame(1, SjValidation::count());
    }

    public function test_start_rejects_draft_rencana(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create']));
        $rk = $this->scheduledRencana($user);
        $rk->update(['status' => 'DRAFT']);

        $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])
            ->assertStatus(422);
    }

    /**
     * Alur Check In → Validasi: dokumen sudah ketemu di gate, jadi mobile
     * memanggil start/{id} — tanpa scan/ketik PO untuk kedua kalinya.
     */
    public function test_start_by_id_resumes_existing_validation(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.create']));
        $rk = $this->scheduledRencana($user);
        $rk->update(['status' => 'CHECKED_IN']);

        $first = $this->postJson("/api/v1/sj-validations/start/{$rk->id}")
            ->assertOk()
            ->json('data');

        $this->assertSame('IN_PROGRESS', $first['status']);
        $this->assertCount(1, $first['items']);

        // Buka lagi dari gate → record yang sama, tidak menggandakan snapshot.
        $again = $this->postJson("/api/v1/sj-validations/start/{$rk->id}")
            ->assertOk()
            ->json('data');

        $this->assertSame($first['id'], $again['id']);
        $this->assertSame(1, SjValidation::count());
    }

    public function test_start_by_id_returns_friendly_404_for_unknown_document(): void
    {
        Sanctum::actingAs($this->userWithPermissions(['sj_validation.create']));

        $this->postJson('/api/v1/sj-validations/start/999999')
            ->assertStatus(404)
            ->assertJsonPath('message', 'Dokumen tidak ditemukan');
    }

    public function test_start_by_id_hides_document_of_another_depot(): void
    {
        $user = $this->userWithPermissions(['sj_validation.create']);
        Sanctum::actingAs($user);

        $rk = $this->scheduledRencana($user);
        $rk->update(['kode_depo' => 'DPO-LAIN', 'nama_depo' => 'Depo Lain']);

        $this->postJson("/api/v1/sj-validations/start/{$rk->id}")
            ->assertStatus(404)
            ->assertJsonPath('message', 'Dokumen tidak ditemukan');
    }

    public function test_start_by_id_rejects_draft_rencana(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create']));
        $rk = $this->scheduledRencana($user);
        $rk->update(['status' => 'DRAFT']);

        $this->postJson("/api/v1/sj-validations/start/{$rk->id}")->assertStatus(422);
    }

    public function test_scan_validates_item_and_requires_photo_for_problem_conditions(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.create', 'sj_validation.validate']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');
        $itemId = $validation['items'][0]['id'];

        // Kondisi bermasalah tanpa foto → 422 dengan error field "photo".
        $this->postJson("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 100,
            'condition' => 'FISIK_RUSAK',
        ])->assertStatus(422)->assertJsonValidationErrors(['photo']);

        // Dengan foto → lolos, status item MISMATCH? Tidak — qty sama → VALIDATED.
        Storage::fake('public');
        $this->post("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 100,
            'condition' => 'FISIK_RUSAK',
            'photo' => UploadedFile::fake()->image('bukti.jpg'),
        ])->assertOk()->assertJsonPath('data.status', 'VALIDATED');
    }

    public function test_scan_normalizes_compact_expiry_dates_and_rejects_invalid_dates(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.create', 'sj_validation.validate']));
        $rk = $this->scheduledRencana($user);
        $rk->update(['status' => 'CHECKED_IN']);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])
            ->assertOk()
            ->json('data');
        $itemId = $validation['items'][0]['id'];
        $scanUrl = "/api/v1/sj-validations/{$validation['id']}/scan";

        $this->postJson($scanUrl, [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 100,
            'expired_date' => '20260823',
        ])->assertOk();

        $this->assertSame(
            '2026-08-23',
            SjValidationItem::findOrFail($itemId)->expired_date->toDateString()
        );

        $this->postJson($scanUrl, [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 100,
            'expired_date' => '20260230',
        ])->assertUnprocessable()->assertJsonValidationErrors(['expired_date']);

        $this->assertSame(
            '2026-08-23',
            SjValidationItem::findOrFail($itemId)->expired_date->toDateString()
        );
    }

    public function test_cancel_marks_session_and_its_batches_cancelled(): void
    {
        // Pembatalan satu-satunya jalur resmi (khusus web). Kalau batch label
        // ikut batal tapi status validasi tidak, label tercetak jadi tak
        // berlaku tanpa jejak pembatalan di dokumennya.
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.create', 'sj_validation.validate', 'sj_validation.cancel']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');
        $itemId = $validation['items'][0]['id'];

        $scanned = $this->postJson("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 100,
            'expired_date' => '2027-01-31',
            'condition' => 'FISIK_BAGUS',
        ])->assertOk()->json('data');

        $this->assertNotEmpty($scanned['batch']['barcode_label'], 'scan harus menerbitkan batch label');

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'CANCELLED');

        $this->assertDatabaseHas('batches', [
            'sj_validation_item_id' => $itemId,
            'status' => 'CANCELLED',
        ]);
    }

    /**
     * Resolve helper: satu validasi yang sudah di-scan lalu di-complete, dengan
     * Receiving masih PENDING (artinya masih bisa dikoreksi).
     */
    private function completedValidationWithOpenReceiving(User $user): array
    {
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');
        $itemId = $validation['items'][0]['id'];

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 100,
            'expired_date' => '2027-01-31',
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertOk();

        return [$validation['id'], $itemId];
    }

    /**
     * Operator biasa TIDAK boleh mengoreksi validasi yang sudah selesai walau
     * punya `sj_validation.validate`. Opening koreksi-after-selesai adalah
     * keputusan tingkat supervisor, bukan kelanjutan izin scan.
     */
    public function test_scan_after_completed_is_denied_without_edit_completed_permission(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.create', 'sj_validation.validate', 'sj_validation.complete']));
        [$validationId, $itemId] = $this->completedValidationWithOpenReceiving($user);

        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 777,
            'expired_date' => '2027-01-31',
            'condition' => 'FISIK_BAGUS',
        ])->assertStatus(422);

        $this->assertDatabaseHas('sj_validation_items', ['id' => $itemId, 'actual_qty' => 100]);
        $this->assertDatabaseHas('receiving_items', ['sj_validation_item_id' => $itemId, 'actual_qty' => 100]);
    }

    /**
     * Pemegang `sj_validation.edit_completed` boleh mengoreksi selama Receiving
     * belum COMPLETED — DANReceivingItem wajib ikut tersinkron, karena sanalah
     * Opname Expired dan laporan Penerimaan membaca angkanya.
     */
    public function test_supervisor_correction_syncs_receiving_item(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions([
            'sj_validation.view', 'sj_validation.create', 'sj_validation.validate',
            'sj_validation.complete', 'sj_validation.edit_completed',
        ]));
        [$validationId, $itemId] = $this->completedValidationWithOpenReceiving($user);

        // QTY_KURANG wajib foto bukti (aturan yang sudah ada sebelumnya), jadi
        // koreksi ini harus dikirim sebagai multipart seperti dari UI.
        $this->post("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 80,
            'expired_date' => '2027-01-31',
            'condition' => 'QTY_KURANG',
            'photo' => UploadedFile::fake()->image('bukti.jpg'),
        ])->assertOk();
        $this->assertDatabaseHas('sj_validation_items', ['id' => $itemId, 'actual_qty' => 80]);

        // Inilah inti dari test ini: tanpa sync, tabel ini diam-diam beda.
        $this->assertDatabaseHas('receiving_items', [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 80,
            'condition' => 'QTY_KURANG',
            'selisih_reason' => 'Qty kurang dari rencana',
        ]);

        // Header Receiving juga harus ikut, kalau tidak total dan detail beda.
        $receiving = Receiving::first();
        $this->assertEquals(80, (float) $receiving->total_received_qty);
    }

    /**
     * Permission `sj_validation.edit_completed` tidak boleh membuka dokumen yang
     * Receiving-nya sudah tutup.
     * Di titik ini `receiving_items` sudah jadi buku besar; menyalin ulang
     * angka hanya menghasilkan dua ledger yang berbeda tanpa ada yang berubah
     * di sisi lain.
     */
    public function test_edit_completed_permission_cannot_reopen_closed_receiving(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions([
            'sj_validation.view', 'sj_validation.create', 'sj_validation.validate',
            'sj_validation.complete', 'sj_validation.edit_completed',
        ]));
        [$validationId, $itemId] = $this->completedValidationWithOpenReceiving($user);

        Receiving::query()->update(['status' => 'COMPLETED']);

        $this->postJson("/api/v1/sj-validations/{$validationId}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 777,
            'expired_date' => '2027-01-31',
            'condition' => 'FISIK_BAGUS',
        ])->assertStatus(422);

        $this->assertDatabaseHas('receiving_items', ['sj_validation_item_id' => $itemId, 'actual_qty' => 100]);
    }

    /**
     * Sesi CANCELLED tidak pernah bisa dihidupkan kembali, siapa pun pelakunya.
     * Label batch-nya sudah dicoret dan tidak berlaku, jadi menghidupkan
     * dokumen itu hanya mengembalikan kekacauan.
     */
    public function test_cancelled_validation_is_never_editable(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions([
            'sj_validation.view', 'sj_validation.create', 'sj_validation.validate',
            'sj_validation.cancel', 'sj_validation.edit_completed',
        ]));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');
        $itemId = $validation['items'][0]['id'];

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/cancel")->assertOk();

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 777,
        ])->assertStatus(422);
    }

    /**
     * Durasi dicatat saat sesi mencapai status terminal, dan TIDAK diisi ulang
     * tiap menit. Dua alasan:
     *
     * 1. Nilai yang sama harus muncul identik di tabel, laporan, dan setelah
     *    reload. Kalau dihitung on-the-fly, angka歷史 lama ikut berubah.
     * 2. Menyimpan tiap menit berarti menulis baris berulang untuk satu sesi.
     */
    public function test_duration_seconds_recorded_on_complete(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create', 'sj_validation.validate', 'sj_validation.complete']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');

        $this->post("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $validation['items'][0]['id'],
            'actual_qty' => 100,
            'expired_date' => '2027-01-31',
        ])->assertOk();

        // NULL sebelum selesai — belum final, bukan berarti 0.
        $this->assertNull($this->validationRow($validation['id'])->duration_seconds);

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertOk();

        $after = $this->validationRow($validation['id']);
        $this->assertNotNull($after->duration_seconds);
        $this->assertGreaterThanOrEqual(0, $after->duration_seconds);

        // Durasi harus konsisten dengan kedua timestamp yang disimpan.
        $this->assertSame(
            $after->completed_at->getTimestamp() - $after->started_at->getTimestamp(),
            $after->duration_seconds,
        );
    }

    /**
     * Sesi CANCELLED juga punya durasi — pembatalan adalah akhir pekerjaan —
     * tapi `completed_at` tetap NULL supaya tidak terlihat seperti "selesai".
     */
    public function test_cancelled_session_records_duration_but_no_completed_at(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create', 'sj_validation.validate', 'sj_validation.cancel']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/cancel")->assertOk();

        $after = $this->validationRow($validation['id']);
        $this->assertSame('CANCELLED', $after->status);
        $this->assertNull($after->completed_at, 'dokumen yang dibatalkan tidak pernah selesai');
        $this->assertNotNull($after->duration_seconds);
    }

    /**
     * Jam yang tidak konsisten (selesai sebelum mulai) menghasilkan NULL, bukan
     * angka negatif. Negatif akan tampil sebagai "−3j" di tabel dan ikut terambil
     * sebagai angka oleh laporan.
     */
    public function test_negative_duration_falls_back_to_null(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create', 'sj_validation.validate', 'sj_validation.complete']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');

        $this->post("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $validation['items'][0]['id'],
            'actual_qty' => 100,
            'expired_date' => '2027-01-31',
        ])->assertOk();

        // Majukan `started_at` ke masa depan, sehingga selesai < mulai.
        SjValidation::whereKey($validation['id'])
            ->update(['started_at' => now()->addDay()]);

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertOk();

        $this->assertNull($this->validationRow($validation['id'])->duration_seconds);
    }

    private function validationRow(int $id): SjValidation
    {
        return SjValidation::findOrFail($id);
    }

    public function test_cancel_requires_permission(): void
    {
        // Tanpa sj_validation.cancel, operator hanya boleh menyelesaikan — bukan
        // membatalkan. Membatalkan membuang pekerjaan validasi tim lain.
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.create', 'sj_validation.complete']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/cancel")->assertStatus(403);

        $this->assertDatabaseHas('sj_validations', [
            'id' => $validation['id'],
            'status' => 'IN_PROGRESS',
        ]);
    }

    public function test_edit_permission_alone_does_not_allow_cancel(): void
    {
        // sj_validation.edit itu permission generik (penyuntingan biasa). Kalau
        // edit ikut mengizinkan pembatalan, siapa pun yang boleh menyunting ikut
        // bisa membuang sesi yang tidak bisa dipulihkan. Cancel di-gate terpisah.
        Sanctum::actingAs($user = $this->userWithPermissions([
            'sj_validation.view', 'sj_validation.create', 'sj_validation.edit',
        ]));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/cancel")->assertStatus(403);

        $this->assertDatabaseHas('sj_validations', [
            'id' => $validation['id'],
            'status' => 'IN_PROGRESS',
        ]);
    }

    public function test_cancel_rejects_completed_validation(): void
    {
        // Setelah COMPLETED, materialisasi receiving sudah terjadi. Membatalkan
        // di titik ini akan membuat dokumen menyesatkan: label dibatalkan tapi
        // stok sudah masuk penerimaan.
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.create', 'sj_validation.validate', 'sj_validation.complete', 'sj_validation.cancel']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');
        $itemId = $validation['items'][0]['id'];

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 100,
            'expired_date' => '2027-01-31',
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();
        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertOk();

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/cancel")->assertStatus(422);

        $this->assertDatabaseHas('sj_validations', [
            'id' => $validation['id'],
            'status' => 'COMPLETED',
        ]);
    }

    public function test_scan_rejects_item_from_another_validation(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create', 'sj_validation.validate', 'sj_validation.complete']));
        $rkA = $this->scheduledRencana($user);
        $rkB = $this->scheduledRencana($user);

        $valA = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rkA->po_transporter])->json('data');
        $valB = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rkB->po_transporter])->json('data');

        $this->postJson("/api/v1/sj-validations/{$valA['id']}/scan", [
            'sj_validation_item_id' => $valB['items'][0]['id'], // item milik validasi lain
            'actual_qty' => 1,
        ])->assertStatus(422);
    }

    public function test_complete_blocks_while_items_pending_then_creates_single_receiving(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create', 'sj_validation.validate', 'sj_validation.complete']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');
        $item = $validation['items'][0];

        // Masih ada item PENDING → ditolak.
        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertStatus(422);

        // Alur nyata: gate-in sudah lewat → rencana berstatus CHECKED_IN.
        $rk->update(['status' => 'CHECKED_IN']);

        // Validasi item → complete → rencana maju ke VERIFIED + Receiving dibuat.
        $this->post("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $item['id'],
            'actual_qty' => 100,
            'expired_date' => '2027-01-31',
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertOk();

        $this->assertSame('VERIFIED', $rk->fresh()->status);
        $this->assertSame(1, Receiving::count());
        $this->assertSame(1, Receiving::where('rencana_kirim_id', $rk->id)->count());
    }

    public function test_complete_blocks_when_expired_date_is_missing(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create', 'sj_validation.validate', 'sj_validation.complete']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');
        $itemId = $validation['items'][0]['id'];

        // Scan tanpa expired tetap boleh disimpan sebagai draft item, tetapi
        // sesi belum boleh ditutup.
        $this->post("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 100,
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Lengkapi tanggal expired untuk 1 item sebelum menyelesaikan validasi.');

        $this->assertDatabaseHas('sj_validations', [
            'id' => $validation['id'],
            'status' => 'IN_PROGRESS',
        ]);
        $this->assertSame(0, Receiving::count());

        // Setelah tanggal dilengkapi, sesi dapat diselesaikan.
        $this->post("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $itemId,
            'actual_qty' => 100,
            'expired_date' => '2027-01-31',
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertOk();
        $this->assertSame('COMPLETED', $this->validationRow($validation['id'])->status);
    }

    public function test_index_includes_item_counts_for_history(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create', 'sj_validation.validate', 'sj_validation.view']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');

        $this->post("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $validation['items'][0]['id'],
            'actual_qty' => 100,
            'expired_date' => '2027-01-31',
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();

        $this->getJson('/api/v1/sj-validations')
            ->assertOk()
            ->assertJsonPath('data.0.id', $validation['id'])
            ->assertJsonPath('data.0.items_count', 1)
            ->assertJsonPath('data.0.validated_items_count', 1);
    }

    public function test_complete_is_idempotent_no_duplicate_receiving(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create', 'sj_validation.validate', 'sj_validation.complete']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');

        $this->post("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $validation['items'][0]['id'],
            'actual_qty' => 100,
            'expired_date' => '2027-01-31',
        ])->assertOk();
        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertOk();
        // Complete kedua → 422 (bukan dobel data).
        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertStatus(422);

        $this->assertSame(1, Receiving::count());
        $this->assertSame(1, DB::table('receiving_items')->count());
    }

    public function test_index_supports_date_filter(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view']));
        $rk = $this->scheduledRencana($user);
        SjValidation::create(['rencana_kirim_id' => $rk->id, 'validated_by' => $user->id, 'scan_code' => $rk->po_transporter, 'status' => 'COMPLETED', 'started_at' => now()]);

        $this->getJson('/api/v1/sj-validations?date_from='.now()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->getJson('/api/v1/sj-validations?date_from='.now()->addYear()->toDateString())
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_item_permission_gate_for_view_only_user(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view']));
        $rk = $this->scheduledRencana($user);

        // view-only tidak boleh memulai validasi.
        $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])
            ->assertStatus(403);
    }

    public function test_scan_requires_validate_permission(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create', 'sj_validation.complete']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');

        // Punya create + complete tapi tanpa validate → scan ditolak.
        $this->postJson("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $validation['items'][0]['id'],
            'actual_qty' => 100,
        ])->assertStatus(403);
    }

    public function test_complete_requires_complete_permission(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create', 'sj_validation.validate']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');

        $this->post("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $validation['items'][0]['id'],
            'actual_qty' => 100,
            'expired_date' => '2027-01-31',
        ])->assertOk();

        // Item sudah tervalidasi tapi tanpa complete permission → ditolak.
        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertStatus(403);
    }

    public function test_index_filters_by_depo_for_master(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'depot.view_all']));

        foreach (['DPO-A' => 'Depo A', 'DPO-B' => 'Depo B'] as $kode => $nama) {
            $rk = RencanaKirim::create([
                'po_transporter' => 'PO-SJ-'.uniqid(),
                'rkh_date' => now()->toDateString(),
                'status' => 'SCHEDULED',
                'kode_depo' => $kode,
                'nama_depo' => $nama,
                'created_by' => $user->id,
            ]);
            SjValidation::create([
                'rencana_kirim_id' => $rk->id,
                'validated_by' => $user->id,
                'scan_code' => $rk->po_transporter,
                'status' => 'IN_PROGRESS',
                'started_at' => now(),
            ]);
        }

        $this->getJson('/api/v1/sj-validations')->assertOk()->assertJsonPath('total', 2);
        $this->getJson('/api/v1/sj-validations?kode_depo=DPO-A')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.rencana_kirim.kode_depo', 'DPO-A');
    }

    public function test_index_ignores_foreign_depo_filter_for_scoped_user(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view']));

        $rk = $this->scheduledRencana($user);
        SjValidation::create([
            'rencana_kirim_id' => $rk->id,
            'validated_by' => $user->id,
            'scan_code' => $rk->po_transporter,
            'status' => 'IN_PROGRESS',
            'started_at' => now(),
        ]);

        // Filter ke depo lain diabaikan — tetap depo sendiri.
        $this->getJson('/api/v1/sj-validations?kode_depo=DPO-B')
            ->assertOk()
            ->assertJsonPath('total', 1);
    }
}
