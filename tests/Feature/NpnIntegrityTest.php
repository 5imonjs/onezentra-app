<?php

namespace Tests\Feature;

use App\Models\Npn;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NpnIntegrityTest extends TestCase
{
    use RefreshDatabase;

    public function test_bos_product_id_unique_di_database(): void
    {
        Npn::create([
            'BOSnetszProductId' => 'BOS-UNIK-1',
            'szNickName' => 'Produk',
            'szStatus' => 'EXISTING',
        ]);

        $this->expectException(QueryException::class);

        Npn::create([
            'BOSnetszProductId' => 'BOS-UNIK-1',
            'szNickName' => 'Duplikat',
            'szStatus' => 'EXISTING',
        ]);
    }

    public function test_show_npn_bisa_dibaca_lintas_depo(): void
    {
        $permission = Permission::firstOrCreate(['slug' => 'npn.view'], ['name' => 'npn.view']);
        $role = Role::firstOrCreate(['slug' => '_npn_viewer'], ['name' => 'NPN Viewer']);
        $role->permissions()->syncWithoutDetaching([$permission->id]);

        $user = User::create([
            'email' => 'npn-viewer@test.com',
            'password' => 'password',
            'full_name' => 'NPN Viewer',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        $npn = Npn::create([
            'BOSnetszProductId' => 'BOS-LINTAS-DEPO',
            'szNickName' => 'Produk Depo Lain',
            'kode_depo' => 'DPT-B',
            'nama_depo' => 'Depo B',
            'szStatus' => 'EXISTING',
        ]);

        Sanctum::actingAs($user);

        $this->getJson("/api/v1/npn/{$npn->id}")
            ->assertOk()
            ->assertJsonPath('data.BOSnetszProductId', 'BOS-LINTAS-DEPO');
    }

    public function test_disk_bukti_tidak_berada_di_storage_publik(): void
    {
        $this->assertStringEndsWith(
            'storage/app/private/evidence',
            str_replace('\\', '/', config('filesystems.disks.public.root'))
        );
        $this->assertSame([], config('filesystems.links'));
    }
}
