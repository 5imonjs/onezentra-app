<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RencanaKirimValidationTest extends TestCase
{
    use RefreshDatabase;

    private function admin(bool $viewAll = false): User
    {
        $role = Role::firstOrCreate(['slug' => '_admin'], ['name' => 'Admin', 'slug' => '_admin']);
        $slugs = ['rencana_kirim.create', 'rencana_kirim.view', 'rencana_kirim.edit'];
        if ($viewAll) {
            $slugs[] = 'depot.view_all';
        }
        foreach ($slugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => $slug === 'depot.view_all' ? 'Depot' : 'Rencana Kirim']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => 'rk-validate-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'RK Validate Admin',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function withItems(RencanaKirim $rk, User $user): RencanaKirim
    {
        RencanaKirimItem::create([
            'rencana_kirim_id' => $rk->id,
            'item_number' => 1,
            'kode_barang' => 'SKU-1',
            'nama_barang' => 'Barang Satu',
            'jumlah' => 5,
            'satuan' => 'CRT',
            'created_by' => $user->id,
        ]);

        return $rk;
    }

    public function test_store_rejects_duplicate_po_transporter_in_same_depot(): void
    {
        Sanctum::actingAs($admin = $this->admin());

        $this->withItems(RencanaKirim::create([
            'po_transporter' => 'PO-DUP', 'status' => 'DRAFT',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'created_by' => $admin->id,
        ]), $admin);

        $response = $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'po-dup', // beda huruf, harus tetap terdeteksi duplikat
            'rkh_date' => now()->toDateString(),
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['po_transporter']);
        $this->assertSame(1, RencanaKirim::count());
    }

    public function test_store_allows_same_po_in_different_depot(): void
    {
        Sanctum::actingAs($admin = $this->admin(viewAll: true));

        $this->withItems(RencanaKirim::create([
            'po_transporter' => 'PO-X', 'status' => 'DRAFT',
            'kode_depo' => 'SGR', 'nama_depo' => 'Depo Satu', 'created_by' => $admin->id,
        ]), $admin);

        // PO sama, depo lain (DPO) → sah, beda depo dari SGR.
        $this->postJson('/api/v1/rencana-kirim', ['po_transporter' => 'PO-X', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test'])
            ->assertStatus(201);

        // PO sama, depo SGR (sama dengan RK awal) → duplikat, ditolak.
        $this->postJson('/api/v1/rencana-kirim', ['po_transporter' => 'PO-X', 'kode_depo' => 'SGR', 'nama_depo' => 'Depo Satu'])
            ->assertStatus(422);

        $this->assertSame(2, RencanaKirim::count());
    }

    public function test_store_rejects_rkh_date_in_the_past(): void
    {
        Sanctum::actingAs($this->admin());

        $response = $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'PO-PAST',
            'rkh_date' => now()->subDay()->toDateString(),
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['rkh_date']);
        $this->assertStringContainsString('masa lalu', (string) $response->json('errors.rkh_date.0'));
    }

    public function test_store_allows_rkh_date_today_or_future(): void
    {
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'PO-TODAY', 'rkh_date' => now()->toDateString(),
        ])->assertStatus(201);

        $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'PO-FUTURE', 'rkh_date' => now()->addWeek()->toDateString(),
        ])->assertStatus(201);

        $this->assertSame(2, RencanaKirim::count());
    }

    public function test_update_rejects_duplicate_po_from_other_plan_but_allows_own(): void
    {
        Sanctum::actingAs($admin = $this->admin());

        $rkA = $this->withItems(RencanaKirim::create([
            'po_transporter' => 'PO-A1', 'status' => 'DRAFT',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'created_by' => $admin->id,
        ]), $admin);
        $rkB = $this->withItems(RencanaKirim::create([
            'po_transporter' => 'PO-B1', 'status' => 'DRAFT',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'created_by' => $admin->id,
        ]), $admin);

        // Ambil PO milik RK lain → ditolak.
        $this->putJson("/api/v1/rencana-kirim/{$rkB->id}", ['po_transporter' => 'PO-A1'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['po_transporter']);

        // Isi ulang PO milik dirinya → lolos (abaikan diri sendiri).
        $this->putJson("/api/v1/rencana-kirim/{$rkB->id}", ['po_transporter' => 'PO-B1'])
            ->assertStatus(200);

        $this->assertSame('PO-B1', $rkB->fresh()->po_transporter);
    }
}
