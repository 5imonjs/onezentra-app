<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportDeleteRowsTest extends TestCase
{
    use RefreshDatabase;

    private function userWithDeletePermission(string $level = 'admin_master'): User
    {
        $role = Role::firstOrCreate(['slug' => 'report_deleter'], ['name' => 'Report Deleter']);
        $permission = Permission::firstOrCreate(
            ['slug' => 'reports.delete'],
            ['name' => 'Hapus Baris Laporan', 'menu_group' => 'Laporan']
        );
        $role->permissions()->syncWithoutDetaching([$permission->id]);

        $user = User::create([
            'email' => 'report-delete-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Report Deleter',
            'kode_depo' => '0000',
            'nama_depo' => 'Kantor Pusat',
            'scope_level' => $level === 'admin_master' ? 'master' : 'depot',
            'level' => $level,
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_only_admin_master_can_delete_report_rows(): void
    {
        $user = $this->userWithDeletePermission('staff_logistic');
        Sanctum::actingAs($user);

        $item = ReceivingItem::create([
            'source' => 'IMPORT_MANUAL',
            'kode_barang' => 'BRG-DEL',
            'nama_barang' => 'Produk Hapus',
            'expected_qty' => 10,
            'actual_qty' => 10,
            'kode_depo' => '0127',
            'nama_depo' => 'Singkawang',
        ]);

        $this->deleteJson('/api/v1/reports/rows', [
            'type' => 'receiving_item',
            'ids' => [$item->id],
        ])->assertForbidden();

        $this->assertDatabaseHas('receiving_items', ['id' => $item->id]);
    }

    public function test_admin_master_can_delete_receiving_item_report_row(): void
    {
        $user = $this->userWithDeletePermission();
        Sanctum::actingAs($user);

        $item = ReceivingItem::create([
            'source' => 'IMPORT_MANUAL',
            'kode_barang' => 'BRG-DEL',
            'nama_barang' => 'Produk Hapus',
            'expected_qty' => 10,
            'actual_qty' => 10,
            'kode_depo' => '0127',
            'nama_depo' => 'Singkawang',
        ]);

        $this->deleteJson('/api/v1/reports/rows', [
            'type' => 'receiving_item',
            'ids' => [$item->id],
        ])->assertOk()->assertJsonPath('deleted', 1);

        $this->assertDatabaseMissing('receiving_items', ['id' => $item->id]);
    }

    public function test_admin_master_can_delete_rencana_kirim_report_row(): void
    {
        $user = $this->userWithDeletePermission();
        Sanctum::actingAs($user);

        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-DELETE-'.uniqid(),
            'status' => 'SCHEDULED',
            'rkh_date' => now()->toDateString(),
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'total_qty' => 10,
            'created_by' => $user->id,
        ]);

        $this->deleteJson('/api/v1/reports/rows', [
            'type' => 'rencana_kirim',
            'ids' => [$rencana->id],
        ])->assertOk()->assertJsonPath('deleted', 1);

        $this->assertDatabaseMissing('rencana_kirim', ['id' => $rencana->id]);
    }
}
