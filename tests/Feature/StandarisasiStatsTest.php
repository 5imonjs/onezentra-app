<?php

namespace Tests\Feature;

use App\Models\Npn;
use App\Models\Permission;
use App\Models\Role;
use App\Models\StandarisasiTumpukan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StandarisasiStatsTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string $email, array $perms): User
    {
        $role = Role::firstOrCreate(['slug' => 'st_'.$email], ['name' => 'ST '.$email]);
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => $email,
            'password' => 'password',
            'full_name' => 'ST '.$email,
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'operator',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function makeRow(string $status, string $bos): StandarisasiTumpukan
    {
        $npn = Npn::create(['BOSnetszProductId' => $bos, 'szNickName' => $bos, 'szStatus' => 'EXISTING']);

        return StandarisasiTumpukan::create([
            'npn_id' => $npn->id,
            'tier' => 3,
            'tinggi_tumpukan' => 2,
            'total_tier_tinggi' => 6,
            'status' => $status,
            'requested_by' => 1,
            'requested_by_email' => 'req@example.com',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
        ]);
    }

    public function test_stats_covers_rows_beyond_page_one(): void
    {
        Sanctum::actingAs($this->userWith('st-stats@example.com', ['standarisasi.view']));
        $this->makeRow('pending', 'B-1');
        $this->makeRow('approved', 'B-2');
        $this->makeRow('approved', 'B-3');

        // Halaman 1 hanya memuat 1 baris, kartu harus tetap menghitung semuanya.
        $this->getJson('/api/v1/standarisasi-tumpukan?per_page=1')->assertOk()->assertJsonCount(1, 'data');

        $res = $this->getJson('/api/v1/standarisasi-tumpukan/stats');

        $res->assertOk()->assertJsonPath('data', [
            'total' => 3,
            'pending' => 1,
            'approved' => 2,
            'rejected' => 0,
        ]);
    }

    public function test_bulk_delete_removes_multiple_rows(): void
    {
        Sanctum::actingAs($this->userWith('st-bulk@example.com', ['standarisasi.view', 'standarisasi.delete']));
        $a = $this->makeRow('pending', 'B-1');
        $b = $this->makeRow('pending', 'B-2');

        $res = $this->postJson('/api/v1/standarisasi-tumpukan/bulk-delete', ['ids' => [$a->id, $b->id]]);

        $res->assertOk()->assertJsonPath('deleted', 2);
        $this->assertDatabaseMissing('standarisasi_tumpukan', ['id' => $a->id]);
        $this->assertDatabaseMissing('standarisasi_tumpukan', ['id' => $b->id]);
    }
}
