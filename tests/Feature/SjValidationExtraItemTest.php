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
}
