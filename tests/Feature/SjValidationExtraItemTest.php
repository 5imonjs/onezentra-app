<?php

namespace Tests\Feature;

use App\Models\Npn;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\Role;
use App\Models\SjValidation;
use App\Models\SjValidationExtraItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Barang di luar rencana kirim (deviation record) — Fase 1.
 *
 * Kontrak yang dijaga: rencana TIDAK diubah, baris tersimpan di
 * `sj_validation_extra_items` (bukan `sj_validation_items`), foto bukti
 * wajib, dan notifikasi email dicatat via pipeline penerima email.
 */
class SjValidationExtraItemTest extends TestCase
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
            'email' => 'sj-extra-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Checker Luar Rencana',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function rencanaKirim(User $user, string $status = 'CHECKED_IN'): RencanaKirim
    {
        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-EXTRA-'.uniqid(),
            'rkh_date' => now()->toDateString(),
            'status' => $status,
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);

        RencanaKirimItem::create([
            'rencana_kirim_id' => $rk->id,
            'item_number' => 1,
            'kode_barang' => 'SKU-PLAN-1',
            'nama_barang' => 'Barang Rencana',
            'jumlah' => 100,
            'satuan' => 'CRT',
            'created_by' => $user->id,
        ]);

        return $rk->refresh();
    }

    private function inProgressValidation(User $user, RencanaKirim $rk): SjValidation
    {
        return SjValidation::create([
            'rencana_kirim_id' => $rk->id,
            'validated_by' => $user->id,
            'scan_code' => $rk->po_transporter,
            'status' => 'IN_PROGRESS',
            'started_at' => now(),
        ]);
    }

    public function test_menyimpan_barang_luar_rencana_dengan_foto_tanpa_mengubah_rencana(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']));
        Storage::fake('public');
        $rk = $this->rencanaKirim($user);
        $validation = $this->inProgressValidation($user, $rk);

        $response = $this->post("/api/v1/sj-validations/{$validation->id}/extra-items", [
            'kode_barang' => 'SKU-LUAR-1',
            'nama_barang' => 'Barang di Luar Rencana',
            'qty' => 7,
            'satuan' => 'CRT',
            'condition' => 'FISIK_BAGUS',
            'notes' => 'Ditulis manual di kertas',
            'photo' => UploadedFile::fake()->image('bukti.jpg'),
        ]);

        $response->assertCreated()->assertJsonPath('data.kode_barang', 'SKU-LUAR-1');

        // Baris tersimpan terpisah dari item rencana — agregat plan-vs-aktual
        // tidak boleh terpengaruh.
        $this->assertDatabaseHas('sj_validation_extra_items', [
            'sj_validation_id' => $validation->id,
            'kode_barang' => 'SKU-LUAR-1',
            'qty' => 7,
            'recorded_by' => $user->id,
        ]);
        $this->assertDatabaseCount('rencana_kirim_items', 1);

        Storage::disk('public')->assertExists($response->json('data.photo'));
    }

    public function test_barcode_mengunci_identitas_barang_ke_master_npn(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']));
        Storage::fake('public');
        $rk = $this->rencanaKirim($user);
        $validation = $this->inProgressValidation($user, $rk);

        $npn = Npn::create([
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'BOSnetszProductId' => 'SKU-NPN-9',
            'szNickName' => 'Gula Kristal 50kg',
            'SAPszUomId' => 'ZAK',
            'szBarcode' => '8991234567890',
        ]);

        $response = $this->post("/api/v1/sj-validations/{$validation->id}/extra-items", [
            'barcode' => '8991234567890',
            'qty' => 3,
            'photo' => UploadedFile::fake()->image('bukti.jpg'),
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('sj_validation_extra_items', [
            'sj_validation_id' => $validation->id,
            'npn_id' => $npn->id,
            'kode_barang' => 'SKU-NPN-9',
            'nama_barang' => 'Gula Kristal 50kg',
            'satuan' => 'ZAK',
            'qty' => 3,
        ]);
    }

    public function test_pilihan_npn_id_mengunci_identitas_dan_satuan_dari_master(): void
    {
        // Pola combobox Rencana Kirim: klien memilih produk dari pencarian NPN
        // lalu mengirim `npn_id` — identitas & satuan wajib mengikuti master,
        // nilai manual yang dikirim bersamanya tidak boleh menimpa.
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']));
        Storage::fake('public');
        $rk = $this->rencanaKirim($user);
        $validation = $this->inProgressValidation($user, $rk);

        $npn = Npn::create([
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'BOSnetszProductId' => 'SKU-NPN-77',
            'szNickName' => 'Minyak Goreng 2L',
            'SAPszUomId' => 'CRT',
        ]);

        $response = $this->post("/api/v1/sj-validations/{$validation->id}/extra-items", [
            'npn_id' => $npn->id,
            'kode_barang' => 'Nilai-manual-harus-tertimpa',
            'nama_barang' => 'Nilai manual',
            'satuan' => 'SAK',
            'qty' => 5,
            'photo' => UploadedFile::fake()->image('bukti.jpg'),
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('sj_validation_extra_items', [
            'sj_validation_id' => $validation->id,
            'npn_id' => $npn->id,
            'kode_barang' => 'SKU-NPN-77',
            'nama_barang' => 'Minyak Goreng 2L',
            'satuan' => 'CRT',
            'qty' => 5,
        ]);
    }

    public function test_npn_id_tidak_dikenal_ditolak(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']));
        $rk = $this->rencanaKirim($user);
        $validation = $this->inProgressValidation($user, $rk);

        $this->post("/api/v1/sj-validations/{$validation->id}/extra-items", [
            'npn_id' => 999999,
            'qty' => 1,
            'photo' => UploadedFile::fake()->image('bukti.jpg'),
        ])->assertStatus(422)->assertJsonValidationErrors(['npn_id']);
    }

    public function test_barang_tidak_dikenal_ditolak(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']));
        Storage::fake('public');
        $rk = $this->rencanaKirim($user);
        $validation = $this->inProgressValidation($user, $rk);

        // Barcode dikirim tapi tidak ada di master NPN dan tidak ada nama/kode
        // manual → tidak boleh tersimpan sebagai teks bebas.
        $this->post("/api/v1/sj-validations/{$validation->id}/extra-items", [
            'barcode' => 'BARCODE-ASING',
            'qty' => 1,
            'photo' => UploadedFile::fake()->image('bukti.jpg'),
        ])->assertJsonValidationErrors(['kode_barang']);

        $this->assertDatabaseCount('sj_validation_extra_items', 0);
    }

    public function test_foto_wajib(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']));
        Storage::fake('public');
        $rk = $this->rencanaKirim($user);
        $validation = $this->inProgressValidation($user, $rk);

        $this->post("/api/v1/sj-validations/{$validation->id}/extra-items", [
            'kode_barang' => 'SKU-LUAR-1',
            'nama_barang' => 'Barang di Luar Rencana',
            'qty' => 1,
        ])->assertJsonValidationErrors(['photo']);

        $this->assertDatabaseCount('sj_validation_extra_items', 0);
    }

    public function test_hanya_sesi_berjalan_yang_boleh_mencatat(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']));
        Storage::fake('public');
        $rk = $this->rencanaKirim($user);
        $validation = SjValidation::create([
            'rencana_kirim_id' => $rk->id,
            'validated_by' => $user->id,
            'scan_code' => $rk->po_transporter,
            'status' => 'COMPLETED',
            'started_at' => now(),
            'completed_at' => now(),
        ]);

        $this->post("/api/v1/sj-validations/{$validation->id}/extra-items", [
            'kode_barang' => 'SKU-LUAR-1',
            'nama_barang' => 'Barang di Luar Rencana',
            'qty' => 1,
            'photo' => UploadedFile::fake()->image('bukti.jpg'),
        ])->assertStatus(422);

        $this->assertDatabaseCount('sj_validation_extra_items', 0);
    }

    public function test_tanpa_permission_menolak(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view']));
        Storage::fake('public');
        $rk = $this->rencanaKirim($user);
        $validation = $this->inProgressValidation($user, $rk);

        $this->post("/api/v1/sj-validations/{$validation->id}/extra-items", [
            'kode_barang' => 'SKU-LUAR-1',
            'nama_barang' => 'Barang di Luar Rencana',
            'qty' => 1,
            'photo' => UploadedFile::fake()->image('bukti.jpg'),
        ])->assertForbidden();
    }

    public function test_show_menyertakan_extra_items(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']));
        Storage::fake('public');
        $rk = $this->rencanaKirim($user);
        $validation = $this->inProgressValidation($user, $rk);

        SjValidationExtraItem::create([
            'sj_validation_id' => $validation->id,
            'kode_barang' => 'SKU-LUAR-1',
            'nama_barang' => 'Barang di Luar Rencana',
            'qty' => 2,
            'satuan' => 'CRT',
            'photo' => 'validation-photos/test.jpg',
            'recorded_by' => $user->id,
        ]);

        $this->get("/api/v1/sj-validations/{$validation->id}")
            ->assertOk()
            ->assertJsonPath('data.extra_items.0.kode_barang', 'SKU-LUAR-1');
    }

    public function test_notifikasi_email_tercatat_via_pipeline_penerima(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']));
        Storage::fake('public');
        $rk = $this->rencanaKirim($user);
        $validation = $this->inProgressValidation($user, $rk);

        // Tanpa penerima email terkonfigurasi: pipeline tidak melempar error
        // dan keputusan (SKIPPED) tercatat di log audit.
        $this->post("/api/v1/sj-validations/{$validation->id}/extra-items", [
            'kode_barang' => 'SKU-LUAR-1',
            'nama_barang' => 'Barang di Luar Rencana',
            'qty' => 1,
            'photo' => UploadedFile::fake()->image('bukti.jpg'),
        ])->assertCreated();

        $this->assertDatabaseHas('email_notification_logs', [
            'document_type' => 'sj_ba',
            'trigger' => 'extra_item',
            'context_id' => $rk->id,
        ]);
    }

    // === Fase 2: keputusan planner (setujui/tolak) ==========================

    private function buatCatatanLuar(User $recorder, SjValidation $validation): SjValidationExtraItem
    {
        return SjValidationExtraItem::create([
            'sj_validation_id' => $validation->id,
            'kode_barang' => 'SKU-LUAR-1',
            'nama_barang' => 'Barang di Luar Rencana',
            'qty' => 2,
            'satuan' => 'CRT',
            'photo' => 'validation-photos/test.jpg',
            'recorded_by' => $recorder->id,
        ]);
    }

    public function test_planner_menyetujui_catatan_luar_rencana(): void
    {
        Sanctum::actingAs($planner = $this->userWithPermissions(['sj_validation.view', 'sj_validation.approve']));
        $recorder = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']);
        $rk = $this->rencanaKirim($planner);
        $validation = $this->inProgressValidation($planner, $rk);
        $extra = $this->buatCatatanLuar($recorder, $validation);

        $this->postJson("/api/v1/sj-validations/{$validation->id}/extra-items/{$extra->id}/approve", [
            'notes' => 'Barang diterima sebagai tambahan',
        ])->assertOk()->assertJsonPath('data.status', 'APPROVED');

        $this->assertDatabaseHas('sj_validation_extra_items', [
            'id' => $extra->id,
            'status' => 'APPROVED',
            'approved_by' => $planner->id,
            'decision_notes' => 'Barang diterima sebagai tambahan',
        ]);

        // Keputusan tercatat via pipeline penerima email.
        $this->assertDatabaseHas('email_notification_logs', [
            'document_type' => 'sj_ba',
            'trigger' => 'extra_item_decision',
            'context_id' => $extra->id,
        ]);
    }

    public function test_menolak_wajib_alasan(): void
    {
        Sanctum::actingAs($planner = $this->userWithPermissions(['sj_validation.view', 'sj_validation.approve']));
        $recorder = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']);
        $rk = $this->rencanaKirim($planner);
        $validation = $this->inProgressValidation($planner, $rk);
        $extra = $this->buatCatatanLuar($recorder, $validation);

        // Tanpa alasan → tidak boleh ditolak.
        $this->postJson("/api/v1/sj-validations/{$validation->id}/extra-items/{$extra->id}/reject", [])
            ->assertJsonValidationErrors(['notes']);
        $this->assertDatabaseHas('sj_validation_extra_items', ['id' => $extra->id, 'status' => 'PENDING']);

        // Dengan alasan → REJECTED.
        $this->postJson("/api/v1/sj-validations/{$validation->id}/extra-items/{$extra->id}/reject", [
            'notes' => 'Barang tidak diterima, kembalikan ke transporter',
        ])->assertOk()->assertJsonPath('data.status', 'REJECTED');

        $this->assertDatabaseHas('sj_validation_extra_items', [
            'id' => $extra->id,
            'status' => 'REJECTED',
            'approved_by' => $planner->id,
            'decision_notes' => 'Barang tidak diterima, kembalikan ke transporter',
        ]);
    }

    public function test_keputusan_bersifat_final_tidak_bisa_diputus_ulang(): void
    {
        Sanctum::actingAs($planner = $this->userWithPermissions(['sj_validation.view', 'sj_validation.approve']));
        $recorder = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']);
        $rk = $this->rencanaKirim($planner);
        $validation = $this->inProgressValidation($planner, $rk);
        $extra = $this->buatCatatanLuar($recorder, $validation);

        $this->postJson("/api/v1/sj-validations/{$validation->id}/extra-items/{$extra->id}/approve", [])
            ->assertOk();

        // Setujui dua kali atau menolak catatan yang sudah diputuskan → 422.
        $this->postJson("/api/v1/sj-validations/{$validation->id}/extra-items/{$extra->id}/approve", [])
            ->assertStatus(422);
        $this->postJson("/api/v1/sj-validations/{$validation->id}/extra-items/{$extra->id}/reject", [
            'notes' => 'Coba ubah keputusan',
        ])->assertStatus(422);

        // Keputusan pertama tetap.
        $this->assertDatabaseHas('sj_validation_extra_items', ['id' => $extra->id, 'status' => 'APPROVED']);
    }

    public function test_tanpa_permission_approve_menolak(): void
    {
        Sanctum::actingAs($recorder = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']));
        $rk = $this->rencanaKirim($recorder);
        $validation = $this->inProgressValidation($recorder, $rk);
        $extra = $this->buatCatatanLuar($recorder, $validation);

        // Operator pelapor tidak otomatis boleh menyetujui laporannya sendiri.
        $this->postJson("/api/v1/sj-validations/{$validation->id}/extra-items/{$extra->id}/approve", [])
            ->assertForbidden();
        $this->assertDatabaseHas('sj_validation_extra_items', ['id' => $extra->id, 'status' => 'PENDING']);
    }

    public function test_catatan_dari_validasi_lain_tidak_bisa_diputuskan(): void
    {
        Sanctum::actingAs($planner = $this->userWithPermissions(['sj_validation.view', 'sj_validation.approve']));
        $recorder = $this->userWithPermissions(['sj_validation.view', 'sj_validation.extra']);
        $rk = $this->rencanaKirim($planner);
        $validation = $this->inProgressValidation($planner, $rk);
        $rkLain = $this->rencanaKirim($planner);
        $validationLain = $this->inProgressValidation($planner, $rkLain);
        $extra = $this->buatCatatanLuar($recorder, $validationLain);

        // id validasi di path tidak cocok dengan pemilik catatan → 404,
        // bukan memutuskan catatan milik dokumen lain.
        $this->postJson("/api/v1/sj-validations/{$validation->id}/extra-items/{$extra->id}/approve", [])
            ->assertNotFound();
    }
}
