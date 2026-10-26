<?php

namespace Tests\Feature;

use App\Models\Npn;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NpnSortTest extends TestCase
{
    use RefreshDatabase;

    private function userWithNpnView(): User
    {
        $role = Role::firstOrCreate(['slug' => 'npn_sort_tester'], ['name' => 'NPN Sort Tester']);
        $perm = Permission::firstOrCreate(['slug' => 'npn.view'], ['name' => 'npn.view', 'menu_group' => 'Test']);
        $role->permissions()->syncWithoutDetaching([$perm->id]);
        $user = User::create([
            'email' => 'npn-sort@example.com',
            'password' => 'password',
            'full_name' => 'NPN Sort Tester',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'operator',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_npn_index_sorts_by_nickname_desc(): void
    {
        Sanctum::actingAs($this->userWithNpnView());
        Npn::create(['szNickName' => 'AAA', 'BOSnetszProductId' => 'B-1', 'szStatus' => 'EXISTING']);
        Npn::create(['szNickName' => 'CCC', 'BOSnetszProductId' => 'B-3', 'szStatus' => 'EXISTING']);
        Npn::create(['szNickName' => 'BBB', 'BOSnetszProductId' => 'B-2', 'szStatus' => 'EXISTING']);

        $res = $this->getJson('/api/v1/npn?sort=szNickName&direction=desc');

        $res->assertOk();
        $this->assertSame(
            ['CCC', 'BBB', 'AAA'],
            array_column($res->json('data'), 'szNickName')
        );
    }

    public function test_npn_index_sorts_by_bos_id_asc(): void
    {
        Sanctum::actingAs($this->userWithNpnView());
        Npn::create(['szNickName' => 'P1', 'BOSnetszProductId' => 'B-30', 'szStatus' => 'EXISTING']);
        Npn::create(['szNickName' => 'P2', 'BOSnetszProductId' => 'B-10', 'szStatus' => 'EXISTING']);
        Npn::create(['szNickName' => 'P3', 'BOSnetszProductId' => 'B-20', 'szStatus' => 'EXISTING']);

        $res = $this->getJson('/api/v1/npn?sort=BOSnetszProductId&direction=asc');

        $res->assertOk();
        $this->assertSame(
            ['B-10', 'B-20', 'B-30'],
            array_column($res->json('data'), 'BOSnetszProductId')
        );
    }

    public function test_npn_index_search_matches_new_nickname(): void
    {
        Sanctum::actingAs($this->userWithNpnView());
        Npn::create([
            'szNickName' => 'LAMA',
            'szNickNameNew' => 'BARU SEKALI',
            'BOSnetszProductId' => 'B-1',
            'szStatus' => 'EXISTING',
        ]);
        Npn::create(['szNickName' => 'LAIN', 'BOSnetszProductId' => 'B-2', 'szStatus' => 'EXISTING']);

        $res = $this->getJson('/api/v1/npn?search='.urlencode('BARU SEKALI'));

        $res->assertOk();
        $this->assertSame(['LAMA'], array_column($res->json('data'), 'szNickName'));
    }

    public function test_npn_index_ignores_unknown_sort_column(): void
    {
        Sanctum::actingAs($this->userWithNpnView());
        Npn::create(['szNickName' => 'ZZZ', 'BOSnetszProductId' => 'B-1', 'szStatus' => 'EXISTING']);
        Npn::create(['szNickName' => 'AAA', 'BOSnetszProductId' => 'B-2', 'szStatus' => 'EXISTING']);

        $res = $this->getJson('/api/v1/npn?sort=password&direction=desc');

        $res->assertOk();
        // Falls back to default szNickName ASC ordering (unknown column ignored, no SQL error).
        $this->assertSame(
            ['AAA', 'ZZZ'],
            array_column($res->json('data'), 'szNickName')
        );
    }
}
