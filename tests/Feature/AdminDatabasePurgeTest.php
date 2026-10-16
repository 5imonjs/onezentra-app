<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminDatabasePurgeTest extends TestCase
{
    use RefreshDatabase;

    private function master(): User
    {
        // Permission database.purge sudah ada dari migration
        // add_database_purge_permission yang ikut RefreshDatabase.
        Permission::firstOrCreate(
            ['slug' => 'database.purge'],
            ['name' => 'Reset Data Operasional', 'menu_group' => 'Sistem']
        );

        return User::factory()->create(['level' => 'admin_master', 'status' => 'active']);
    }

    private function otherUser(): User
    {
        $role = Role::create(['slug' => 'no_purge', 'name' => 'No Purge', 'is_active' => true]);
        // role_id TIDAK fillable — relasi role hanya lewat pivot role_user.
        $user = User::factory()->create(['level' => 'cheker', 'status' => 'active']);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_master_melihat_ringkasah_isi_modul(): void
    {
        Sanctum::actingAs($this->master());

        $this->getJson('/api/v1/admin/database/summary')
            ->assertOk()
            ->assertJsonPath('data.rencana_kirim', 0);
    }

    public function test_non_master_ditolak_walau_punya_permission_nyata(): void
    {
        // Level lain tetap 403: controller meng-gate ulang level, bukan
        // sekadar permission — grant manual slug ini via UI tidak membuka purge.
        $user = $this->otherUser();
        $role = Role::where('slug', 'no_purge')->firstOrFail();
        $role->permissions()->attach(
            Permission::firstOrCreate(
                ['slug' => 'database.purge'],
                ['name' => 'Reset', 'menu_group' => 'Sistem']
            )->id
        );

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/admin/database/summary')->assertForbidden();
        $this->postJson('/api/v1/admin/database/purge', [
            'modules' => ['rencana_kirim'], 'confirm' => 'HAPUS',
        ])->assertForbidden();
    }

    public function test_purge_tanpa_konfirmasi_teks_ditolak(): void
    {
        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/admin/database/purge', [
            'modules' => ['rencana_kirim'], 'confirm' => 'YA',
        ])->assertStatus(422);
    }

    public function test_dry_run_hanya_menghitung_tanpa_menghapus(): void
    {
        Sanctum::actingAs($this->master());
        $rencana = RencanaKirim::factory()->create();

        $this->postJson('/api/v1/admin/database/purge', [
            'modules' => ['rencana_kirim'], 'confirm' => 'HAPUS', 'dry_run' => true,
        ])->assertOk()->assertJsonPath('data.counts.rencana_kirim', 1);

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencana->id]);
    }

    public function test_master_bisa_mengosongkan_rencana_kirim_tanpa_pandang_status(): void
    {
        Sanctum::actingAs($this->master());
        RencanaKirim::factory()->completed()->create();
        RencanaKirim::factory()->create(['status' => 'IN_PROGRESS']);

        $this->postJson('/api/v1/admin/database/purge', [
            'modules' => ['rencana_kirim'], 'confirm' => 'HAPUS',
        ])->assertOk()->assertJsonPath('data.before.rencana_kirim', 2);

        $this->assertSame(0, RencanaKirim::count());
    }
}
