<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Receiving;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\Role;
use App\Models\SjValidation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
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
            'level' => 'admin_master',
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
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();

        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertOk();

        $this->assertSame('VERIFIED', $rk->fresh()->status);
        $this->assertSame(1, Receiving::count());
        $this->assertSame(1, Receiving::where('rencana_kirim_id', $rk->id)->count());
    }

    public function test_complete_is_idempotent_no_duplicate_receiving(): void
    {
        Sanctum::actingAs($user = $this->userWithPermissions(['sj_validation.create', 'sj_validation.validate', 'sj_validation.complete']));
        $rk = $this->scheduledRencana($user);
        $validation = $this->postJson('/api/v1/sj-validations/start-by-code', ['scan_code' => $rk->po_transporter])->json('data');

        $this->post("/api/v1/sj-validations/{$validation['id']}/scan", [
            'sj_validation_item_id' => $validation['items'][0]['id'],
            'actual_qty' => 100,
        ])->assertOk();
        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertOk();
        // Complete kedua → 422 (bukan dobel data).
        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertStatus(422);

        $this->assertSame(1, Receiving::count());
        $this->assertSame(1, \DB::table('receiving_items')->count());
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
        ])->assertOk();

        // Item sudah tervalidasi tapi tanpa complete permission → ditolak.
        $this->postJson("/api/v1/sj-validations/{$validation['id']}/complete")->assertStatus(403);
    }
}
