<?php

namespace Tests\Feature;

use App\Models\Npn;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\StandarisasiTumpukan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Mengunci keputusan: akses lintas depo standarisasi ditentukan PERMISSION
 * (`standarisasi.view_all`), bukan hardcode slug role.
 *
 * Riwayat:
 *  - dulu `canManageRow()` menulis literal `['blc', 'staff_logistic']`;
 *  - lalu diganti `depot.view_all` (saklar GLOBAL, lintas semua modul);
 *  - revisi 2026-10-09: BLC cukup `standarisasi.view_all` (khusus modul ini)
 *    supaya tidak ikut melihat semua depo di modul lain maupun dashboard.
 *
 * Test di bawah sengaja menguji lewat endpoint nyata, bukan memanggil
 * `canManageRow()` langsung — supaya yang terukur adalah perilaku yang
 * dilihat user, bukan detail internal yang bisa berubah.
 *
 * Sisi negatif (depo lain ditolak) dan sisi positif (depo sendiri boleh)
 * keduanya diuji. Kalau hanya sisi negatifnya, test tetap hijau pada guard
 * yang terlalu ketat.
 */
class StandarisasiDepotScopeTest extends TestCase
{
    use RefreshDatabase;

    private function userWithRole(string $roleSlug, array $perms, string $kodeDepo): User
    {
        $role = Role::firstOrCreate(['slug' => $roleSlug], ['name' => $roleSlug, 'slug' => $roleSlug]);
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => $roleSlug.'-'.strtolower($kodeDepo).'-'.uniqid().'@test.com',
            'password' => 'password',
            'full_name' => $roleSlug.' '.$kodeDepo,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'level' => $roleSlug,
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user->fresh()->load('roles');
    }

    private function row(string $kodeDepo): StandarisasiTumpukan
    {
        // npn_id NOT NULL — kolom `qty_awal` yang biasa dipakai test lain tidak
        // ada di tabel ini sama sekali; yang dipakai adalah `tier`.
        $npn = Npn::create([
            'produk' => 'Produk '.uniqid(),
            'kode_depo' => $kodeDepo,
        ]);

        return StandarisasiTumpukan::create([
            'npn_id' => $npn->id,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'tier' => 1,
            'tinggi_tumpukan' => 100,
            'status' => 'PENDING',
        ]);
    }

    /**
     * Sisi utama: `blc` MELEWATI scoping depo karena diberi
     * `standarisasi.view_all` (permission khusus modul) di PermissionSeeder.
     *
     * Modul ini berubah dari hardcode ke permission. Kalau permission-nya
     * dicabut dari seeder, test ini harus gagal — itu gunanya.
     */
    public function test_blc_dengan_standarisasi_view_all_bisa_mengubah_baris_depo_lain(): void
    {
        $user = $this->userWithRole('blc', ['standarisasi.edit', 'standarisasi.view_all'], 'DPT-A');
        $row = $this->row('DPT-B');

        Sanctum::actingAs($user);

        $this->putJson("/api/v1/standarisasi-tumpukan/{$row->id}", ['tier' => 9])
            ->assertOk();

        $this->assertDatabaseHas('standarisasi_tumpukan', ['id' => $row->id, 'tier' => 9]);
    }

    /**
     * `blc` TANPA `standarisasi.view_all` harus ter-scope seperti user biasa.
     *
     * Inilah yang membedakan keputusan ini dari hardcode lama: sebelumnya
     * slug `blc` selalu bisa menembus, apa pun permission-nya.
     */
    public function test_blc_tanpa_standarisasi_view_all_ditolak_untuk_depo_lain(): void
    {
        $user = $this->userWithRole('blc', ['standarisasi.edit'], 'DPT-A');
        $row = $this->row('DPT-B');

        Sanctum::actingAs($user);

        $this->putJson("/api/v1/standarisasi-tumpukan/{$row->id}", ['tier' => 9])
            ->assertStatus(403);

        $this->assertDatabaseHas('standarisasi_tumpukan', ['id' => $row->id, 'tier' => 1]);
    }

    /**
     * Daftar standarisasi ikut melebar lintas depo dengan permission ini,
     * bukan hanya aksi per baris — kalau hanya `canManageRow` yang diubah,
     * user tetap tidak menemukan barisnya untuk dikerjakan.
     */
    public function test_standarisasi_view_all_membuka_daftar_lintas_depo(): void
    {
        $user = $this->userWithRole('blc', ['standarisasi.view', 'standarisasi.view_all'], 'DPT-A');
        $this->row('DPT-A');
        $this->row('DPT-B');

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/standarisasi-tumpukan')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    /**
     * Permission ini SENGAJA sempit: ia tidak boleh membuka modul lain.
     * User dengan `standarisasi.view_all` tetap tidak melihat rencana kirim
     * depo lain (tidak ada bypass global seperti `depot.view_all`).
     */
    public function test_standarisasi_view_all_tidak_membuka_modul_lain(): void
    {
        $user = $this->userWithRole('blc', ['rencana_kirim.view', 'standarisasi.view_all'], 'DPT-A');
        $mine = RencanaKirim::create([
            'po_transporter' => 'SJ-MINE', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo DPT-A',
            'status' => 'DRAFT', 'created_by' => $user->id,
        ]);
        RencanaKirim::create([
            'po_transporter' => 'SJ-THEIRS', 'kode_depo' => 'DPT-B', 'nama_depo' => 'Depo DPT-B',
            'status' => 'DRAFT', 'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/rencana-kirim')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $mine->id);
    }

    /**
     * Sisi positif: user ter-scope tetap boleh bekerja di depo sendiri.
     * Menangkap guard yang terlalu ketat setelah perubahan permission.
     */
    public function test_user_ter_scope_tetap_boleh_di_depo_sendiri(): void
    {
        $user = $this->userWithRole('staff_logistic', ['standarisasi.edit'], 'DPT-A');
        $row = $this->row('DPT-A');

        Sanctum::actingAs($user);

        $this->putJson("/api/v1/standarisasi-tumpukan/{$row->id}", ['tier' => 4])
            ->assertOk();

        $this->assertDatabaseHas('standarisasi_tumpukan', ['id' => $row->id, 'tier' => 4]);
    }

    /** `staff_logistic` kehilangan bypass — kini ter-scope seperti biasa. */
    public function test_staff_logistic_tidak_lagi_melewati_scoping(): void
    {
        $user = $this->userWithRole('staff_logistic', ['standarisasi.edit'], 'DPT-A');
        $row = $this->row('DPT-B');

        Sanctum::actingAs($user);

        $this->putJson("/api/v1/standarisasi-tumpukan/{$row->id}", ['tier' => 9])
            ->assertStatus(403);
    }

    /**
     * Delete massal wajib memfilter baris yang boleh diakses.
     *
     * Endpoint ini menghitung `$allowedIds` lewat `canManageRow()`, jadi
     * ia jalur yang berbeda dari `authorizeDepot()` — guard di satu tempat
     * saja tidak otomatis menutup jalur ini.
     */
    public function test_bulk_delete_tidak_menghapus_baris_depo_lain(): void
    {
        $user = $this->userWithRole('staff_logistic', ['standarisasi.delete'], 'DPT-A');
        $mine = $this->row('DPT-A');
        $theirs = $this->row('DPT-B');

        Sanctum::actingAs($user);

        // Endpoint-nya POST, bukan DELETE meski namanya "delete" di path.
        $this->postJson('/api/v1/standarisasi-tumpukan/bulk-delete', ['ids' => [$mine->id, $theirs->id]])
            ->assertOk();

        $this->assertDatabaseMissing('standarisasi_tumpukan', ['id' => $mine->id]);
        $this->assertDatabaseHas('standarisasi_tumpukan', ['id' => $theirs->id]);
    }
}
