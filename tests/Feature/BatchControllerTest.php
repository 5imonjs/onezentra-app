<?php

namespace Tests\Feature;

use App\Models\Batch;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\SjValidation;
use App\Models\SjValidationExtraItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BatchControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'batch_admin'], ['name' => 'Batch Admin']);
        foreach (['receiving.view', 'receiving.create'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->user = User::create([
            'email' => 'batch@test.com',
            'password' => 'password',
            'full_name' => 'Batch User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
            'role_id' => $role->id,
        ]);
        $role->users()->attach($this->user->id);

        Sanctum::actingAs($this->user);
    }

    public function test_index_returns_batches(): void
    {
        $rk = RencanaKirim::create(['po_transporter' => 'SJ-BATCH-01', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'status' => 'COMPLETED', 'created_by' => $this->user->id]);
        $rcv = Receiving::create(['rencana_kirim_id' => $rk->id, 'status' => 'COMPLETED']);
        Batch::create(['batch_number' => 'BATCH-001', 'receiving_id' => $rcv->id, 'status' => 'ACTIVE']);

        $this->getJson('/api/v1/batches')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_index_search_by_batch_number(): void
    {
        $rk = RencanaKirim::create(['po_transporter' => 'SJ-BATCH-02', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'status' => 'COMPLETED', 'created_by' => $this->user->id]);
        $rcv = Receiving::create(['rencana_kirim_id' => $rk->id, 'status' => 'COMPLETED']);
        Batch::create(['batch_number' => 'BATCH-SEARCH', 'receiving_id' => $rcv->id, 'status' => 'ACTIVE']);

        $this->getJson('/api/v1/batches?search=BATCH-SEARCH')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_index_filter_by_status(): void
    {
        $rk = RencanaKirim::create(['po_transporter' => 'SJ-BATCH-03', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'status' => 'COMPLETED', 'created_by' => $this->user->id]);
        $rcv = Receiving::create(['rencana_kirim_id' => $rk->id, 'status' => 'COMPLETED']);
        Batch::create(['batch_number' => 'B1', 'receiving_id' => $rcv->id, 'status' => 'ACTIVE']);
        Batch::create(['batch_number' => 'B2', 'receiving_id' => $rcv->id, 'status' => 'ARCHIVED']);

        $this->getJson('/api/v1/batches?status=ACTIVE')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_show_returns_single_batch(): void
    {
        $rk = RencanaKirim::create(['po_transporter' => 'SJ-BATCH-04', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'status' => 'COMPLETED', 'created_by' => $this->user->id]);
        $rcv = Receiving::create(['rencana_kirim_id' => $rk->id, 'status' => 'COMPLETED']);
        $batch = Batch::create(['batch_number' => 'BATCH-SHOW', 'receiving_id' => $rcv->id, 'status' => 'ACTIVE']);

        $this->getJson("/api/v1/batches/{$batch->id}")->assertOk()->assertJsonPath('data.batch_number', 'BATCH-SHOW');
    }

    public function test_show_other_depot_batch_is_forbidden(): void
    {
        $otherUser = User::create([
            'email' => 'other@depot.test', 'password' => 'password', 'full_name' => 'Other',
            'kode_depo' => 'OTHER', 'nama_depo' => 'Other Depo', 'level' => 'staff_logistic', 'status' => 'active',
        ]);
        $otherRole = Role::firstOrCreate(['slug' => 'batch_other'], ['name' => 'Batch Other']);
        $otherRole->users()->attach($otherUser->id);

        $rk = RencanaKirim::create(['po_transporter' => 'SJ-OTHER', 'kode_depo' => 'OTHER', 'nama_depo' => 'Other Depo', 'status' => 'COMPLETED', 'created_by' => $otherUser->id]);
        $rcv = Receiving::create(['rencana_kirim_id' => $rk->id, 'status' => 'COMPLETED']);
        $batch = Batch::create(['batch_number' => 'BATCH-OTHER', 'receiving_id' => $rcv->id, 'status' => 'ACTIVE']);

        $this->getJson("/api/v1/batches/{$batch->id}")->assertForbidden();
    }

    public function test_by_number_returns_batch(): void
    {
        $rk = RencanaKirim::create(['po_transporter' => 'SJ-BATCH-05', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'status' => 'COMPLETED', 'created_by' => $this->user->id]);
        $rcv = Receiving::create(['rencana_kirim_id' => $rk->id, 'status' => 'COMPLETED']);
        Batch::create(['batch_number' => 'FIND-ME', 'receiving_id' => $rcv->id, 'status' => 'ACTIVE']);

        $this->getJson('/api/v1/batches/search/by-number?batch_number=FIND-ME')->assertOk()->assertJsonPath('data.batch_number', 'FIND-ME');
    }

    public function test_by_number_not_found(): void
    {
        $this->getJson('/api/v1/batches/search/by-number?batch_number=NOPE')->assertNotFound();
    }

    public function test_mark_printed_sets_printed_at(): void
    {
        $perm = Permission::firstOrCreate(['slug' => 'penerimaan.view'], ['name' => 'penerimaan.view', 'menu_group' => 'Test']);
        Role::firstWhere('slug', 'batch_admin')->permissions()->syncWithoutDetaching([$perm->id]);

        $batch = $this->makeBatch('PRINT-ME');

        $this->postJson("/api/v1/batches/{$batch->id}/mark-printed")
            ->assertOk()
            ->assertJsonPath('data.printed_at', fn ($printedAt) => $printedAt !== null);

        $this->assertNotNull($batch->refresh()->printed_at);
    }

    public function test_mark_printed_extra_item_batch_is_authorized_for_own_depot(): void
    {
        // Regresi: batch barang luar rencana hanya terikat
        // sj_validation_extra_item_id — authorizeDepot tidak mengenalinya,
        // jadi laporan "sudah dicetak" dari mobile/web membalas 403.
        $perm = Permission::firstOrCreate(['slug' => 'penerimaan.view'], ['name' => 'penerimaan.view', 'menu_group' => 'Test']);
        Role::firstWhere('slug', 'batch_admin')->permissions()->syncWithoutDetaching([$perm->id]);

        $rk = RencanaKirim::create(['po_transporter' => 'SJ-EXTRA-PRINT', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'status' => 'CHECKED_IN', 'created_by' => $this->user->id]);
        $validation = SjValidation::create(['rencana_kirim_id' => $rk->id, 'status' => 'IN_PROGRESS', 'scan_code' => 'SJ-EXTRA-PRINT']);
        $extra = SjValidationExtraItem::create([
            'sj_validation_id' => $validation->id,
            'kode_barang' => 'SKU-EXTRA-PRINT',
            'nama_barang' => 'Barang Luar Rencana',
            'qty' => 1,
            'satuan' => 'CRT',
            'photo' => 'validation-photos/extra-print.jpg',
            'recorded_by' => $this->user->id,
        ]);
        $batch = Batch::create([
            'batch_number' => 'PRINT-EXTRA',
            'sj_validation_extra_item_id' => $extra->id,
            'barcode_label' => 'LBL-PRINT-EXTRA',
            'status' => 'ACTIVE',
        ]);

        $this->postJson("/api/v1/batches/{$batch->id}/mark-printed")
            ->assertOk()
            ->assertJsonPath('data.printed_at', fn ($printedAt) => $printedAt !== null);

        $this->assertNotNull($batch->refresh()->printed_at);
    }

    public function test_mark_printed_extra_item_batch_from_other_depot_is_forbidden(): void
    {
        $perm = Permission::firstOrCreate(['slug' => 'penerimaan.view'], ['name' => 'penerimaan.view', 'menu_group' => 'Test']);
        Role::firstWhere('slug', 'batch_admin')->permissions()->syncWithoutDetaching([$perm->id]);

        $rk = RencanaKirim::create(['po_transporter' => 'SJ-EXTRA-LAIN', 'kode_depo' => 'DPO-Z', 'nama_depo' => 'Depo Z', 'status' => 'CHECKED_IN', 'created_by' => $this->user->id]);
        $validation = SjValidation::create(['rencana_kirim_id' => $rk->id, 'status' => 'IN_PROGRESS', 'scan_code' => 'SJ-EXTRA-LAIN']);
        $extra = SjValidationExtraItem::create([
            'sj_validation_id' => $validation->id,
            'kode_barang' => 'SKU-LAIN',
            'nama_barang' => 'Barang Depo Lain',
            'qty' => 1,
            'satuan' => 'CRT',
            'photo' => 'validation-photos/extra-lain.jpg',
            'recorded_by' => $this->user->id,
        ]);
        $batch = Batch::create([
            'batch_number' => 'PRINT-EXTRA-LAIN',
            'sj_validation_extra_item_id' => $extra->id,
            'barcode_label' => 'LBL-EXTRA-LAIN',
            'status' => 'ACTIVE',
        ]);

        $this->postJson("/api/v1/batches/{$batch->id}/mark-printed")
            ->assertForbidden()
            ->assertJsonPath('message', 'Batch tidak ditemukan di depo Anda.');
        $this->assertNull($batch->refresh()->printed_at);
    }

    public function test_mark_printed_is_idempotent_keeps_first_timestamp(): void
    {
        $perm = Permission::firstOrCreate(['slug' => 'penerimaan.view'], ['name' => 'penerimaan.view', 'menu_group' => 'Test']);
        Role::firstWhere('slug', 'batch_admin')->permissions()->syncWithoutDetaching([$perm->id]);

        $batch = $this->makeBatch('PRINT-TWICE');
        // startOfSecond: kolom datetime tidak menyimpan mikrodetik —
        // tanpa ini perbandingan equalTo selalu beda walau nilai sama.
        $original = now()->subDay()->startOfSecond();
        $batch->forceFill(['printed_at' => $original])->save();

        $this->postJson("/api/v1/batches/{$batch->id}/mark-printed")->assertOk();

        $this->assertTrue($batch->refresh()->printed_at->equalTo($original));
    }

    public function test_mark_printed_cancelled_batch_returns_422(): void
    {
        $perm = Permission::firstOrCreate(['slug' => 'penerimaan.view'], ['name' => 'penerimaan.view', 'menu_group' => 'Test']);
        Role::firstWhere('slug', 'batch_admin')->permissions()->syncWithoutDetaching([$perm->id]);

        $batch = $this->makeBatch('PRINT-CANCELLED', 'CANCELLED');

        $this->postJson("/api/v1/batches/{$batch->id}/mark-printed")->assertStatus(422);
        $this->assertNull($batch->refresh()->printed_at);
    }

    public function test_mark_printed_without_permission_returns_403(): void
    {
        $batch = $this->makeBatch('PRINT-FORBIDDEN');

        $this->postJson("/api/v1/batches/{$batch->id}/mark-printed")->assertForbidden();
        $this->assertNull($batch->refresh()->printed_at);
    }

    private function makeBatch(string $number, string $status = 'ACTIVE'): Batch
    {
        $rk = RencanaKirim::create(['po_transporter' => "SJ-{$number}", 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'status' => 'COMPLETED', 'created_by' => $this->user->id]);
        $rcv = Receiving::create(['rencana_kirim_id' => $rk->id, 'status' => 'COMPLETED']);

        return Batch::create(['batch_number' => $number, 'receiving_id' => $rcv->id, 'barcode_label' => "LBL-{$number}", 'status' => $status]);
    }
}
