<?php

namespace Tests\Feature;

use App\Imports\StandarisasiTumpukanImport;
use App\Models\Npn;
use App\Models\Permission;
use App\Models\Role;
use App\Models\StandarisasiTumpukan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Import standarisasi tidak boleh menyentuh baris depo lain.
 *
 * `StandarisasiTumpukanImport` mencocokkan baris hanya dari `npn_id`; tanpa
 * scoping depo, user ber-scope bisa menimpa (dan menurunkan status approved)
 * baris milik depo lain. Test ini mengunci guard di kelas import itu sendiri
 * — bukan lewat endpoint — karena inti bug-nya ada di resolusi baris.
 */
class StandarisasiImportDepotScopeTest extends TestCase
{
    use RefreshDatabase;

    private function scopedUser(string $kodeDepo, array $perms = ['standarisasi.import']): User
    {
        $role = Role::firstOrCreate(['slug' => 'import_scope_'.$kodeDepo], ['name' => 'Import Scope '.$kodeDepo, 'slug' => 'import_scope_'.$kodeDepo]);
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'import-'.$kodeDepo.'-'.uniqid().'@test.com',
            'password' => 'password',
            'full_name' => 'Import '.$kodeDepo,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user->fresh()->load('roles');
    }

    private function row(string $kodeDepo, int $tier = 1): StandarisasiTumpukan
    {
        $npn = Npn::create(['produk' => 'Produk '.uniqid(), 'kode_depo' => $kodeDepo]);

        return StandarisasiTumpukan::create([
            'npn_id' => $npn->id,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'tier' => $tier,
            'tinggi_tumpukan' => 10,
            'status' => 'approved',
        ]);
    }

    public function test_import_does_not_overwrite_other_depot_row(): void
    {
        $theirs = $this->row('DPT-B', tier: 3);
        $user = $this->scopedUser('DPT-A');

        (new StandarisasiTumpukanImport($user))->collection(collect([
            ['npn_id' => $theirs->npn_id, 'tier' => 9, 'tinggi_tumpukan' => 9],
        ]));

        // Baris depo lain tidak boleh berubah — tier & status tetap.
        $this->assertDatabaseHas('standarisasi_tumpukan', [
            'id' => $theirs->id,
            'tier' => 3,
            'status' => 'approved',
        ]);

        // Sebagai gantinya baris baru dibuat untuk depo user.
        $this->assertDatabaseHas('standarisasi_tumpukan', [
            'npn_id' => $theirs->npn_id,
            'kode_depo' => 'DPT-A',
            'tier' => 9,
        ]);
    }

    public function test_import_updates_own_depot_row(): void
    {
        $mine = $this->row('DPT-A', tier: 3);
        $user = $this->scopedUser('DPT-A');

        $import = new StandarisasiTumpukanImport($user);
        $import->collection(collect([
            ['npn_id' => $mine->npn_id, 'tier' => 9, 'tinggi_tumpukan' => 9],
        ]));

        $this->assertSame(1, $import->updated);
        $this->assertDatabaseHas('standarisasi_tumpukan', [
            'id' => $mine->id,
            'tier' => 9,
            // approved dibuka kembali ke pending saat diimport ulang.
            'status' => 'pending',
        ]);
    }
}
