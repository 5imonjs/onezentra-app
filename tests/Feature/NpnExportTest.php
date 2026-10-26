<?php

namespace Tests\Feature;

use App\Exports\NpnExport;
use App\Models\Npn;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NpnExportTest extends TestCase
{
    use RefreshDatabase;

    private function userWithNpnView(): User
    {
        $role = Role::firstOrCreate(['slug' => 'npn_export_tester'], ['name' => 'NPN Export Tester']);
        $perm = Permission::firstOrCreate(['slug' => 'npn.view'], ['name' => 'npn.view', 'menu_group' => 'Test']);
        $role->permissions()->syncWithoutDetaching([$perm->id]);
        $user = User::create([
            'email' => 'npn-export@example.com',
            'password' => 'password',
            'full_name' => 'NPN Export Tester',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'operator',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_template_export_contains_headers_only(): void
    {
        Npn::create(['szNickName' => 'PRODUK', 'BOSnetszProductId' => 'B-1', 'szStatus' => 'EXISTING']);

        $export = new NpnExport(empty: true);

        $this->assertSame(0, $export->query()->count());
        $this->assertNotEmpty($export->headings());
        $this->assertContains('BOSnetszProductId', $export->headings());
    }

    public function test_export_query_respects_status_filter(): void
    {
        Npn::create(['szNickName' => 'AKTIF', 'BOSnetszProductId' => 'B-1', 'szStatus' => 'EXISTING']);
        Npn::create(['szNickName' => 'HAPUS', 'BOSnetszProductId' => 'B-2', 'szStatus' => 'DEL']);

        $statuses = (new NpnExport(szStatus: 'DEL'))->query()->pluck('szStatus')->unique()->values()->all();

        $this->assertSame(['DEL'], $statuses);
    }

    public function test_export_search_matches_new_nickname(): void
    {
        Npn::create([
            'szNickName' => 'LAMA',
            'szNickNameNew' => 'NICKNAME BARU',
            'BOSnetszProductId' => 'B-1',
            'szStatus' => 'EXISTING',
        ]);
        Npn::create([
            'szNickName' => 'LAIN',
            'BOSnetszProductId' => 'B-2',
            'szStatus' => 'EXISTING',
        ]);

        $rows = (new NpnExport(search: 'NICKNAME BARU'))->query()->get();

        $this->assertCount(1, $rows);
        $this->assertSame('LAMA', $rows->first()->szNickName);
    }

    public function test_export_search_matches_category_description(): void
    {
        Npn::create([
            'szNickName' => 'PRODUK KATEGORI',
            'szCat1Description' => 'Minyak Goreng Sawit',
            'BOSnetszProductId' => 'B-1',
            'szStatus' => 'EXISTING',
        ]);
        Npn::create([
            'szNickName' => 'LAIN',
            'BOSnetszProductId' => 'B-2',
            'szStatus' => 'EXISTING',
        ]);

        $rows = (new NpnExport(search: 'Goreng Sawit'))->query()->get();

        $this->assertCount(1, $rows);
        $this->assertSame('PRODUK KATEGORI', $rows->first()->szNickName);
    }

    public function test_export_endpoint_forwards_status_filter(): void
    {
        Sanctum::actingAs($this->userWithNpnView());
        Npn::create(['szNickName' => 'AKTIF', 'BOSnetszProductId' => 'B-1', 'szStatus' => 'EXISTING']);
        Npn::create(['szNickName' => 'HAPUS', 'BOSnetszProductId' => 'B-2', 'szStatus' => 'DEL']);

        $res = $this->get('/api/v1/npn/export?szStatus=DEL');

        $res->assertOk();
        $this->assertStringContainsString(
            'spreadsheetml',
            $res->headers->get('Content-Type') ?? ''
        );
    }

    public function test_template_endpoint_returns_spreadsheet(): void
    {
        Sanctum::actingAs($this->userWithNpnView());
        Npn::create(['szNickName' => 'PRODUK', 'BOSnetszProductId' => 'B-1', 'szStatus' => 'EXISTING']);

        $res = $this->get('/api/v1/npn/template');

        $res->assertOk();
        $this->assertStringContainsString(
            'spreadsheetml',
            $res->headers->get('Content-Type') ?? ''
        );
    }
}
