<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RencanaKirimIndexFilterTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Regresi: frontend memanggil index dengan ?po_transporter=&kode_depo= sebagai
     * early-warning duplikat, tetapi index() dulu mengabaikan kedua parameter itu —
     * respons selalu tak terfilter sehingga peringatan tidak pernah muncul.
     */
    public function test_index_filters_by_exact_po_transporter_case_insensitively(): void
    {
        $user = $this->viewer();

        RencanaKirim::create([
            'po_transporter' => 'PO-DUP-1',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);
        RencanaKirim::create([
            'po_transporter' => 'PO-LAIN',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/rencana-kirim?po_transporter=po-dup-1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.po_transporter', 'PO-DUP-1');
    }

    public function test_index_filters_by_kode_depo(): void
    {
        $user = $this->viewer();

        RencanaKirim::create([
            'po_transporter' => 'PO-FILTER-A',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);
        RencanaKirim::create([
            'po_transporter' => 'PO-FILTER-B',
            'status' => 'DRAFT',
            'kode_depo' => 'LAIN',
            'nama_depo' => 'Depo Lain',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/rencana-kirim?kode_depo=LAIN')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.po_transporter', 'PO-FILTER-B');
    }

    public function test_index_combines_po_transporter_and_kode_depo(): void
    {
        $user = $this->viewer();

        RencanaKirim::create([
            'po_transporter' => 'PO-GABUNG',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'created_by' => $user->id,
        ]);
        RencanaKirim::create([
            'po_transporter' => 'PO-GABUNG',
            'status' => 'DRAFT',
            'kode_depo' => 'LAIN',
            'nama_depo' => 'Depo Lain',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        // PO sama di depo berbeda: hanya kombinasi yang cocok yang dihitung duplikat.
        $this->getJson('/api/v1/rencana-kirim?po_transporter=PO-GABUNG&kode_depo=DPO')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.kode_depo', 'DPO');

        $this->getJson('/api/v1/rencana-kirim?po_transporter=PO-GABUNG&kode_depo=TIDAKADA')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    private function viewer(): User
    {
        $role = Role::firstOrCreate(['slug' => 'rk_filter_view'], ['name' => 'RK Filter View']);
        foreach (['rencana_kirim.view', 'depot.view_all'] as $slug) {
            $perm = Permission::firstOrCreate(
                ['slug' => $slug],
                ['name' => $slug, 'menu_group' => 'Rencana Kirim']
            );
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'rk-filter-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'RK Filter User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }
}
