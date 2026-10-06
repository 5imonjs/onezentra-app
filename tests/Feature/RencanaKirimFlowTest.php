<?php

namespace Tests\Feature;

use App\Models\Npn;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RencanaKirimFlowTest extends TestCase
{
    use RefreshDatabase;

    private function adminUser(): User
    {
        $role = Role::firstOrCreate(['slug' => '_admin'], ['name' => 'Admin', 'slug' => '_admin']);
        $user = User::create([
            'email' => 'flow_admin@example.com',
            'password' => 'password',
            'full_name' => 'Flow Admin',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_unauthorized_role_is_forbidden()
    {
        $role = Role::firstOrCreate(['slug' => '_test_min'], ['name' => 'Test Min', 'slug' => '_test_min']);
        $user = User::create([
            'email' => 'flow_test@example.com',
            'password' => 'password',
            'full_name' => 'Flow Test',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        Sanctum::actingAs($user);
        $response = $this->postJson('/api/v1/rencana-kirim');
        $response->assertStatus(403);
    }

    public function test_invalid_transition_is_rejected()
    {
        // Admin passes the permission middleware (has all perms via DB seeder for admin_master level? use explicit role with perms)
        $user = $this->adminUser();
        // attach rencana_kirim.edit + depot.view_all permission to _admin role
        $perm = Permission::firstOrCreate(['slug' => 'rencana_kirim.edit'], ['name' => 'Rencana Kirim Edit', 'menu_group' => 'Rencana Kirim', 'icon' => 'edit', 'route' => 'rencana_kirim.edit']);
        $permViewAll = Permission::firstOrCreate(['slug' => 'depot.view_all'], ['name' => 'Akses Semua Depo', 'menu_group' => 'General', 'icon' => 'globe']);
        \DB::table('role_permission')->insert([
            'role_id' => Role::where('slug', '_admin')->value('id'),
            'permission_id' => $perm->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        \DB::table('role_permission')->insert([
            'role_id' => Role::where('slug', '_admin')->value('id'),
            'permission_id' => $permViewAll->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $rencanaKirim = RencanaKirim::create([
            'po_transporter' => 'PO-TEST-001',
            'status' => 'DRAFT',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);
        // DRAFT -> VERIFIED invalid
        $response = $this->postJson("/api/v1/rencana-kirim/{$rencanaKirim->id}/verify");
        $response->assertStatus(422);

        // DRAFT -> SCHEDULED valid
        $ok = $this->postJson("/api/v1/rencana-kirim/{$rencanaKirim->id}/schedule");
        $ok->assertStatus(200);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencanaKirim->id, 'status' => 'SCHEDULED']);
    }

    public function test_store_persists_jenis_kendaraan_and_calculates_kubikasi(): void
    {
        $user = $this->adminUser();
        foreach (['rencana_kirim.create', 'rencana_kirim.view'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Rencana Kirim', 'icon' => 'plus']);
            \DB::table('role_permission')->insert([
                'role_id' => Role::where('slug', '_admin')->value('id'),
                'permission_id' => $perm->id,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $npn = Npn::create([
            'BOSnetszProductId' => '90101111202100',
            'szNickName' => 'AJTM',
            'szNickNameNew' => 'GKAOG7',
            'SAPszUomId' => 'CRT',
            'SAPdecUom' => '60',
            'decVolume' => '785.68',
            'szStatus' => 'EXISTING',
        ]);

        Sanctum::actingAs($user);
        $response = $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'PO-KUB-001',
            'driver_name' => 'Budi',
            'nopol' => 'DA 1111 BC',
            'jenis_kendaraan' => 'CDD',
            'items' => [[
                'item_number' => 1,
                'npn_id' => $npn->id,
                'kode_barang' => $npn->BOSnetszProductId,
                'nama_barang' => 'AJTM',
                'jumlah' => 10,
                'satuan' => 'CRT',
            ]],
        ]);

        $response->assertStatus(201);
        $data = $response->json('data');
        $this->assertSame('CDD', $data['jenis_kendaraan']);
        $this->assertDatabaseHas('rencana_kirim', ['jenis_kendaraan' => 'CDD']);
        $this->assertSame(10.0, (float) $data['total_qty']);

        // Kubikasi = 10 × 785.68 × 60 / 1.000.000 = 0.4714 m³
        $this->assertEqualsWithDelta(0.4714, (float) $data['total_kubikasi'], 0.0001);
        $this->assertEqualsWithDelta(0.4714, (float) $data['items'][0]['kubikasi'], 0.0001);

        $show = $this->getJson("/api/v1/rencana-kirim/{$data['id']}");
        $show->assertOk();
        $this->assertEqualsWithDelta(0.4714, (float) $show->json('data.total_kubikasi'), 0.0001);
    }

    public function test_update_replaces_items_and_recomputes_kubikasi(): void
    {
        $user = $this->adminUser();
        foreach (['rencana_kirim.create', 'rencana_kirim.edit', 'depot.view_all'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Rencana Kirim']);
            \DB::table('role_permission')->insert([
                'role_id' => Role::where('slug', '_admin')->value('id'),
                'permission_id' => $perm->id,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $npn = Npn::create([
            'BOSnetszProductId' => '90101111203100',
            'szNickName' => 'AJT1D',
            'szNickNameNew' => 'AJT1D',
            'SAPszUomId' => 'CRT',
            'SAPdecUom' => '50',
            'decVolume' => '364',
            'szStatus' => 'EXISTING',
        ]);

        $rencanaKirim = RencanaKirim::create([
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'po_transporter' => 'PO-UPD-001',
            'jenis_kendaraan' => 'CDE',
            'status' => 'DRAFT',
            'created_by' => $user->id,
        ]);
        RencanaKirimItem::create([
            'rencana_kirim_id' => $rencanaKirim->id,
            'item_number' => 1,
            'npn_id' => $npn->id,
            'kode_barang' => $npn->BOSnetszProductId,
            'nama_barang' => 'AJT1D',
            'jumlah' => 5,
            'satuan' => 'CRT',
        ]);

        Sanctum::actingAs($user);
        $response = $this->putJson("/api/v1/rencana-kirim/{$rencanaKirim->id}", [
            'jenis_kendaraan' => 'TRONTON',
            'items' => [[
                'item_number' => 1,
                'npn_id' => $npn->id,
                'kode_barang' => $npn->BOSnetszProductId,
                'nama_barang' => 'AJT1D',
                'jumlah' => 12,
                'satuan' => 'CRT',
            ]],
        ]);

        $response->assertOk();
        $data = $response->json('data');
        $this->assertSame('TRONTON', $data['jenis_kendaraan']);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencanaKirim->id, 'jenis_kendaraan' => 'TRONTON']);

        // Kubikasi = 12 × 364 × 50 / 1.000.000 = 0.2184 m³
        $this->assertEqualsWithDelta(0.2184, (float) $data['total_kubikasi'], 0.0001);
    }

    public function test_scoped_user_cannot_move_document_to_other_depot_via_update()
    {
        $role = Role::firstOrCreate(['slug' => '_rk_scoped'], ['name' => 'RK Scoped']);
        $perm = Permission::firstOrCreate(['slug' => 'rencana_kirim.edit'], ['name' => 'Rencana Kirim Edit']);
        $role->permissions()->syncWithoutDetaching([$perm->id]);

        $user = User::create([
            'email' => 'rk-scoped@example.com',
            'password' => 'password',
            'full_name' => 'RK Scoped',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        $rencanaKirim = RencanaKirim::create([
            'po_transporter' => 'PO-RK-'.uniqid(),
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->putJson("/api/v1/rencana-kirim/{$rencanaKirim->id}", [
            'kode_depo' => 'LAIN',
            'nama_depo' => 'Depo Lain',
            'notes' => 'coba pindah',
        ])->assertOk();

        $this->assertSame('DPO', $rencanaKirim->fresh()->kode_depo);
        $this->assertSame('coba pindah', $rencanaKirim->fresh()->notes);
    }
}
