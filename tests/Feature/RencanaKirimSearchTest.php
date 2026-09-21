<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RencanaKirimSearchTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Regresi: pencarian dulu menyertakan kolom `rkh_number` yang sudah di-drop.
     * SQLite memperlakukan identifier tak dikenal sebagai string literal sehingga
     * test lama tetap lolos, tetapi MySQL melempar SQLSTATE[42S22] (500).
     */
    public function test_index_search_does_not_reference_dropped_rkh_number_column(): void
    {
        $user = $this->viewer();

        RencanaKirim::create([
            'po_transporter' => 'PO-SEARCH-1',
            'driver_name' => 'Budi',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $queries = [];
        DB::listen(function ($query) use (&$queries): void {
            $queries[] = $query->sql;
        });

        $this->getJson('/api/v1/rencana-kirim?search=PO-SEARCH-1')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->assertNotEmpty($queries);
        foreach ($queries as $sql) {
            $this->assertStringNotContainsString('rkh_number', $sql);
        }
    }

    public function test_index_search_matches_driver_and_nopol(): void
    {
        $user = $this->viewer();

        RencanaKirim::create([
            'po_transporter' => 'PO-SEARCH-2',
            'driver_name' => 'Slamet',
            'nopol' => 'KB 9999 ZZ',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/rencana-kirim?search=Slamet')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/rencana-kirim?search=KB 9999 ZZ')->assertOk()->assertJsonCount(1, 'data');
    }

    private function viewer(): User
    {
        $role = Role::firstOrCreate(['slug' => 'rk_search_view'], ['name' => 'RK Search View']);
        foreach (['rencana_kirim.view', 'depot.view_all'] as $slug) {
            $perm = Permission::firstOrCreate(
                ['slug' => $slug],
                ['name' => $slug, 'menu_group' => 'Rencana Kirim']
            );
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'rk-search-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'RK Search User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }
}
