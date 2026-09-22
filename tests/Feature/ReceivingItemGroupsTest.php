<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReceivingItemGroupsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'penerimaan_view'], ['name' => 'Penerimaan View']);
        $perm = Permission::firstOrCreate(['slug' => 'penerimaan.view'], ['name' => 'penerimaan.view', 'menu_group' => 'Penerimaan']);
        $role->permissions()->syncWithoutDetaching([$perm->id]);
        $edit = Permission::firstOrCreate(['slug' => 'penerimaan.edit'], ['name' => 'penerimaan.edit', 'menu_group' => 'Penerimaan']);
        $role->permissions()->syncWithoutDetaching([$edit->id]);

        $this->user = User::create([
            'email' => 'groups@test.com',
            'password' => 'password',
            'full_name' => 'Groups User',
            'kode_depo' => '0127',
            'nama_depo' => 'Singkawang',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        // Bypass depot scope: permission depot.view_all menempel di role user.
        $viewAll = Permission::firstOrCreate(['slug' => 'depot.view_all'], ['name' => 'depot.view_all']);
        $role->permissions()->syncWithoutDetaching([$viewAll->id]);
        $role->users()->attach($this->user->id);

        Sanctum::actingAs($this->user);
    }

    private function makeReceiving(): Receiving
    {
        // receivings.rencana_kirim_id NOT NULL: setiap receiving butuh induk RK.
        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-'.uniqid(),
            'driver_name' => 'Driver '.uniqid(),
            'status' => 'COMPLETED',
            'created_by' => $this->user->id,
        ]);

        return Receiving::create([
            'rencana_kirim_id' => $rk->id,
            'status' => 'COMPLETED',
        ]);
    }

    private function makeSjItem(array $attributes = []): ReceivingItem
    {
        return ReceivingItem::create(array_merge([
            'source' => 'VALIDASI_SJ',
            'kode_barang' => 'BRG-001',
            'nama_barang' => 'Barang Satu',
            'actual_qty' => 5,
            'qty_pcs' => 60,
            'satuan' => 'CRT',
            'expired_date' => '2026-12-01',
            'tanggal_penerimaan' => '2026-09-10',
            'kode_depo' => '0127',
            'nama_depo' => 'Singkawang',
            'condition' => 'FISIK_BAGUS',
        ], $attributes));
    }

    public function test_groups_items_by_receiving_and_keeps_group_whole(): void
    {
        // Receiving A dengan 3 item, dibuat di waktu berbeda.
        $receivingA = $this->makeReceiving();
        $this->makeSjItem(['receiving_id' => $receivingA->id, 'actual_qty' => 1]);
        $this->makeSjItem(['receiving_id' => $receivingA->id, 'actual_qty' => 2, 'kode_barang' => 'BRG-002']);
        $this->makeSjItem(['receiving_id' => $receivingA->id, 'actual_qty' => 3, 'expired_date' => '2026-11-01']);

        // Receiving B dengan 1 item.
        $receivingB = $this->makeReceiving();
        $this->makeSjItem(['receiving_id' => $receivingB->id, 'kode_barang' => 'BRG-003', 'actual_qty' => 9]);

        // per_page = 1 group per halaman: group A (terbaru) harus UTUH berisi 3 item.
        $res = $this->getJson('/api/v1/receiving-items/groups?per_page=1&page=1')->assertOk();

        $this->assertCount(1, $res->json('data'));
        $group = $res->json('data.0');
        $this->assertSame($receivingA->id, $group['receiving_id']);
        $this->assertCount(3, $group['items']);
        $this->assertEquals(6.0, $group['total_crt']);

        // Halaman 2 memuat group B utuh.
        $res2 = $this->getJson('/api/v1/receiving-items/groups?per_page=1&page=2')->assertOk();
        $this->assertCount(1, $res2->json('data'));
        $this->assertSame($receivingB->id, $res2->json('data.0.receiving_id'));
        $this->assertCount(1, $res2->json('data.0.items'));
    }

    public function test_groups_manual_items_bucketed_by_date(): void
    {
        // Dua item manual-ish tanpa receiving pada tanggal sama -> satu group.
        $this->makeSjItem(['kode_barang' => 'BRG-A', 'tanggal_penerimaan' => '2026-09-05']);
        $this->makeSjItem(['kode_barang' => 'BRG-B', 'tanggal_penerimaan' => '2026-09-05']);
        // Tanggal lain -> group terpisah.
        $this->makeSjItem(['kode_barang' => 'BRG-C', 'tanggal_penerimaan' => '2026-09-06']);

        $res = $this->getJson('/api/v1/receiving-items/groups')->assertOk();

        $this->assertSame(2, $res->json('meta.total'));
        $this->assertSame(2, count($res->json('data')));
    }

    public function test_search_matches_po_transporter_and_driver(): void
    {
        $receiving = $this->makeReceiving();
        $this->makeSjItem(['receiving_id' => $receiving->id]);
        $this->makeSjItem(['receiving_id' => $receiving->id, 'kode_barang' => 'BRG-009']);
        // Item lain pada receiving berbeda.
        $other = $this->makeReceiving();
        $this->makeSjItem(['receiving_id' => $other->id, 'kode_barang' => 'BRG-777']);

        $receiving->rencanaKirim()->update(['po_transporter' => 'PO-UNIK-123', 'driver_name' => 'Budi Santoso']);

        // Cari lewat PO transporter (janji placeholder UI).
        $res = $this->getJson('/api/v1/receiving-items/groups?search=PO-UNIK-123')->assertOk();
        $this->assertSame(1, $res->json('meta.total'));
        $this->assertSame($receiving->id, $res->json('data.0.receiving_id'));

        // Cari lewat nama driver.
        $resDriver = $this->getJson('/api/v1/receiving-items/groups?search=Budi')->assertOk();
        $this->assertSame(1, $resDriver->json('meta.total'));

        // Endpoint index lama juga kini mencakup PO.
        $resIndex = $this->getJson('/api/v1/receiving-items?search=PO-UNIK-123')->assertOk();
        $this->assertSame(2, $resIndex->json('total'));
    }

    public function test_group_items_sorted_newest_first_inside_group(): void
    {
        $receiving = $this->makeReceiving();
        $this->makeSjItem(['receiving_id' => $receiving->id, 'kode_barang' => 'OLD', 'created_at' => now()->subMinute(), 'updated_at' => now()->subMinute()]);
        $this->makeSjItem(['receiving_id' => $receiving->id, 'kode_barang' => 'NEW', 'created_at' => now(), 'updated_at' => now()]);

        $res = $this->getJson('/api/v1/receiving-items/groups')->assertOk();

        $ids = array_column($res->json('data.0.items'), 'kode_barang');
        $this->assertSame(['NEW', 'OLD'], $ids);
    }

    public function test_groups_item_with_null_depot_fields_still_listed(): void
    {
        // Regresi: item materialisasi validasi lama tanpa cap depo mentah
        // (hanya fallback accessor) sempat hilang — total > 0 tapi data kosong.
        $receiving = $this->makeReceiving();
        $receiving->rencanaKirim()->update(['kode_depo' => '0127', 'nama_depo' => 'Singkawang']);
        $this->makeSjItem([
            'receiving_id' => $receiving->id,
            'kode_barang' => 'BRG-NULL-DEPO',
            'kode_depo' => null,
            'nama_depo' => null,
            'tanggal_penerimaan' => null,
        ]);

        $res = $this->getJson('/api/v1/receiving-items/groups')->assertOk();

        $this->assertSame(1, $res->json('meta.total'));
        $this->assertCount(1, $res->json('data'));
        $this->assertCount(1, $res->json('data.0.items'));
        $this->assertSame('BRG-NULL-DEPO', $res->json('data.0.items.0.kode_barang'));
        // Tampilan tetap memakai fallback induk.
        $this->assertSame('Singkawang', $res->json('data.0.depo'));
    }

    public function test_groups_manual_item_without_raw_date_uses_created_date(): void
    {
        $this->makeSjItem(['kode_barang' => 'BRG-NODATE', 'tanggal_penerimaan' => null]);

        $res = $this->getJson('/api/v1/receiving-items/groups')->assertOk();

        $this->assertSame(1, $res->json('meta.total'));
        $this->assertSame('BRG-NODATE', $res->json('data.0.items.0.kode_barang'));
    }

    public function test_update_requires_photo_for_bad_condition_without_existing(): void
    {
        $item = $this->makeSjItem(['kode_barang' => 'BRG-NOPHOTO']);

        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'condition' => 'FISIK_RUSAK',
        ])->assertStatus(422)->assertJsonValidationErrors('photo');
    }

    public function test_update_stores_photo_and_deletes_old(): void
    {
        Storage::fake('public');
        $item = $this->makeSjItem(['kode_barang' => 'BRG-PHOTO']);
        $oldPath = UploadedFile::fake()->image('lama.jpg')->store('validation-photos', 'public');
        $item->update(['photo' => $oldPath]);

        $file = UploadedFile::fake()->image('baru.jpg');
        $this->call('POST', "/api/v1/receiving-items/{$item->id}", [
            '_method' => 'PUT',
            'condition' => 'FISIK_RUSAK',
        ], [], ['photo' => $file])->assertOk();

        $item->refresh();
        $this->assertNotNull($item->photo);
        $this->assertNotSame($oldPath, $item->photo);
        Storage::disk('public')->assertExists($item->photo);
        Storage::disk('public')->assertMissing($oldPath);
    }

    public function test_update_allows_bagus_condition_without_photo(): void
    {
        $item = $this->makeSjItem(['kode_barang' => 'BRG-NOPHOTO']);

        $this->putJson("/api/v1/receiving-items/{$item->id}", [
            'condition' => 'FISIK_BAGUS',
            'notes' => 'cek ulang',
        ])->assertOk();
    }
}
