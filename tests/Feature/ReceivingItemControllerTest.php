<?php

namespace Tests\Feature;

use App\Models\OpnameExpiredBaselineImport;
use App\Models\Permission;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use App\Services\OpnameExpiredService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReceivingItemControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'receiving_edit'], ['name' => 'Receiving Edit']);
        foreach (['penerimaan.view', 'penerimaan.edit', 'penerimaan.delete'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Penerimaan']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->user = User::create([
            'email' => 'receiving-edit@test.com',
            'password' => 'password',
            'full_name' => 'Receiving User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($this->user->id);

        Sanctum::actingAs($this->user);
    }

    private function makeItem(string $source = 'IMPORT_MANUAL'): ReceivingItem
    {
        return ReceivingItem::create([
            'source' => $source,
            'kode_barang' => 'TES-MANUAL',
            'nama_barang' => 'Test Manual',
            'expected_qty' => 10,
            'actual_qty' => 10,
            'qty_pcs' => 100,
            'satuan' => 'CRT',
            'expired_date' => '2026-12-01',
            'tanggal_penerimaan' => '2026-09-01',
            'sumber_material' => 'SHA',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'condition' => 'GOOD',
        ]);
    }

    public function test_update_receiving_item_sj_and_manual(): void
    {
        $item = $this->makeItem('VALIDASI_SJ');

        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'qty_crt' => 8,
            'qty_pcs' => 80,
            'expired_date' => '2026-12-15',
            'condition' => 'GOOD',
            'kode_depo' => '0127',
        ])->assertOk()->assertJsonPath('data.kode_barang', 'TES-MANUAL');

        $fresh = $item->fresh();
        $this->assertEquals('8.00', (string) $fresh->actual_qty);
        // Jejak ekspektasi dipertahankan, selisih dihitung ulang (bukan dinolkan).
        $this->assertEquals('10.00', (string) $fresh->expected_qty);
        $this->assertEquals(-2, (float) $fresh->selisih_qty);
        $this->assertEquals('2026-12-15', $fresh->expired_date->toDateString());
        $this->assertSame('VALIDASI_SJ', $fresh->source);
        // User depot-scoped tidak bisa memindahkan baris ke depo lain.
        $this->assertSame('DPO', $fresh->kode_depo);
    }

    public function test_update_can_mark_and_unmark_baseline_coverage(): void
    {
        $this->travelTo('2026-09-10 10:00:00');

        OpnameExpiredBaselineImport::create([
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'baseline_date' => '2026-09-01',
            'file_name' => 'baseline.xlsx',
            'imported_by' => $this->user->id,
            'imported_at' => now(),
        ]);

        // Tanggal setelah baseline: belum otomatis tercakup, jadi bisa
        // ditandai manual sebagai barang lama yang baru diinput.
        $item = $this->makeItem('VALIDASI_SJ');
        $item->update(['tanggal_penerimaan' => '2026-09-05']);

        $service = app(OpnameExpiredService::class);
        $this->assertNull($service->baselineCoverageReason($item->fresh()));

        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'qty_crt' => 10,
            'baseline_covered' => true,
            'baseline_cover_note' => 'Barang sudah ada saat baseline, baru diinput.',
        ])->assertOk()
            ->assertJsonPath('opname_synced', true);

        $covered = $item->fresh();
        $this->assertNotNull($covered->baseline_covered_at);
        $this->assertSame($this->user->id, $covered->baseline_covered_by);
        $this->assertSame('Barang sudah ada saat baseline, baru diinput.', $covered->baseline_cover_note);
        $this->assertNotNull($covered->baseline_import_id);
        $this->assertSame('manual', $service->baselineCoverageReason($covered));

        // Mengedit baris yang sudah tercakup tidak boleh mereset waktu/petugas
        // penanda — itu jejak audit kapan koreksi cakupan dilakukan.
        $markedAt = $covered->baseline_covered_at->toDateTimeString();
        $this->travelTo('2026-09-10 12:00:00');
        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'qty_crt' => 10,
            'baseline_covered' => true,
            'baseline_cover_note' => 'Barang sudah ada saat baseline, baru diinput.',
        ])->assertOk();
        $this->assertSame($markedAt, $item->fresh()->baseline_covered_at->toDateTimeString());

        // Lepas penanda: baris kembali dihitung sebagai stok baru tanpa
        // menghapus data ledger.
        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'baseline_covered' => false,
        ])->assertOk();

        $uncovered = $item->fresh();
        $this->assertNull($uncovered->baseline_covered_at);
        $this->assertNull($uncovered->baseline_covered_by);
        $this->assertNull($uncovered->baseline_cover_note);
        $this->assertNull($service->baselineCoverageReason($uncovered));
        $this->assertDatabaseHas('receiving_items', ['id' => $item->id]);

        // Mengubah tanggal penerimaan juga langsung menyinkronkan opname,
        // karena tanggal menentukan cakupan baseline otomatis.
        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'tanggal_penerimaan' => '2026-09-06',
        ])->assertOk()
            ->assertJsonPath('opname_synced', true);
    }

    public function test_baseline_row_cannot_be_marked_as_covered_duplicate(): void
    {
        $manifest = OpnameExpiredBaselineImport::create([
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'baseline_date' => '2026-09-01',
            'file_name' => 'baseline.xlsx',
            'imported_by' => $this->user->id,
            'imported_at' => now(),
        ]);

        // Simulasikan baris baseline yang sudah direklasifikasi ke VALIDASI_SJ:
        // tetap stok awal, bukan duplikat yang boleh disembunyikan.
        $item = $this->makeItem('LEGACY_IMPORT');
        $item->update([
            'source' => ReceivingItem::SOURCE_VALIDASI,
            'baseline_import_id' => $manifest->id,
        ]);

        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'baseline_covered' => true,
        ])->assertStatus(422)
            ->assertJsonValidationErrors('baseline_covered');
    }

    public function test_index_exposes_whether_receipt_date_is_stored(): void
    {
        $withDate = $this->makeItem('IMPORT_MANUAL');
        $withoutDate = $this->makeItem('IMPORT_MANUAL');
        // Accessor tetap mengembalikan fallback, tetapi modal edit tidak boleh
        // menulis tanggal fallback itu saat pengguna hanya mengubah field lain.
        $withoutDate->update(['tanggal_penerimaan' => null]);

        $rows = collect($this->getJson('/api/v1/receiving-items')->assertOk()->json('data'))
            ->keyBy('id');

        $this->assertTrue($rows[$withDate->id]['has_tanggal_penerimaan']);
        $this->assertFalse($rows[$withoutDate->id]['has_tanggal_penerimaan']);
    }

    public function test_update_other_depot_row_is_forbidden(): void
    {
        $item = $this->makeItem();
        $item->update(['kode_depo' => 'LAIN', 'nama_depo' => 'Depo Lain']);

        $this->putJson("/api/v1/receiving-items/{$item->id}", ['qty_crt' => 1])
            ->assertForbidden();
        $this->deleteJson("/api/v1/receiving-items/{$item->id}")
            ->assertForbidden();
    }

    public function test_update_recomputes_qty_pcs_from_conversion_factor(): void
    {
        $item = $this->makeItem('VALIDASI_SJ');
        $item->update(['conversion_factor' => 12, 'qty_pcs' => 120]);

        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'qty_crt' => 8,
            'expired_date' => '2026-12-15',
        ])->assertOk();

        $fresh = $item->fresh();
        $this->assertEquals('8.00', (string) $fresh->actual_qty);
        $this->assertEquals('96.00', (string) $fresh->qty_pcs);
    }

    public function test_update_normalizes_condition_to_canonical_vocabulary(): void
    {
        $item = $this->makeItem('VALIDASI_SJ');

        $this->putJson("/api/v1/receiving-items/{$item->id}", ['condition' => 'GOOD'])->assertOk();
        $this->assertSame('FISIK_BAGUS', $item->fresh()->condition);

        // Kondisi bermasalah tanpa foto ditolak (sejajar validasi SJ).
        $this->putJson("/api/v1/receiving-items/{$item->id}", ['condition' => 'NOT GOOD'])->assertStatus(422);
    }

    public function test_update_partial_fields_keeps_others(): void
    {
        $item = $this->makeItem();

        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'sumber_material' => 'PABRIK A',
        ])->assertOk();

        $fresh = $item->fresh();
        $this->assertSame('PABRIK A', $fresh->sumber_material);
        $this->assertEquals('10.00', (string) $fresh->actual_qty);
        $this->assertEquals('2026-12-01', $fresh->expired_date->toDateString());
    }

    public function test_update_without_edit_permission_is_forbidden(): void
    {
        $item = $this->makeItem();
        $limited = User::create([
            'email' => 'limited@test.com',
            'password' => 'password',
            'full_name' => 'Limited User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role = Role::firstOrCreate(['slug' => 'receiving_view_only'], ['name' => 'Receiving View']);
        $perm = Permission::firstOrCreate(['slug' => 'penerimaan.view'], ['name' => 'penerimaan.view']);
        $role->permissions()->syncWithoutDetaching([$perm->id]);
        $role->users()->attach($limited->id);

        Sanctum::actingAs($limited);

        $this->putJson("/api/v1/receiving-items/{$item->id}", ['qty_crt' => 1])
            ->assertForbidden();
    }

    public function test_update_receiving_item_can_reclassify_source_to_manual_import(): void
    {
        // SJ validation memetakan item ke VALIDASI_SJ. Klasifikasi sumber
        // harus bisa ditetapkan ulang lewat update supaya data baseline hasil
        // input manual yang kemudian divalidasi SJ kembali ke bucket import
        // di source filter batch expired.
        $item = $this->makeItem('VALIDASI_SJ');

        $this->putJson("/api/v1/receiving-items/{$item->id}", ['source' => 'IMPORT_MANUAL'])
            ->assertOk()
            ->assertJsonPath('data.source', 'IMPORT_MANUAL');

        $this->assertSame('IMPORT_MANUAL', $item->fresh()->source);
    }

    public function test_update_receiving_item_rejects_unknown_source(): void
    {
        $item = $this->makeItem('VALIDASI_SJ');

        $this->putJson("/api/v1/receiving-items/{$item->id}", ['source' => 'BOGUS'])
            ->assertStatus(422);
    }
}
