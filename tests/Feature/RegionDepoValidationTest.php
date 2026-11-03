<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RegionDepoValidationTest extends TestCase
{
    use RefreshDatabase;

    private int $depotPontianakId;

    private int $depotLainId;

    protected function setUp(): void
    {
        parent::setUp();

        // Jadikan request tes sebagai request stateful Sanctum agar middleware
        // session aktif (Origin/Referer cocok dengan domain stateful lokal).
        $this->withHeaders([
            'Origin' => 'http://localhost',
            'Referer' => 'http://localhost',
        ]);

        DB::table('regions')->insert([
            ['code' => '001', 'name' => 'REGION JATAKALBAR', 'created_at' => now(), 'updated_at' => now()],
            ['code' => '002', 'name' => 'REGION LAIN', 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->depotPontianakId = DB::table('depot_settings')->insertGetId([
            'kode_depo' => '0126',
            'region_id' => '001',
            'nama_depo' => 'Depo Pontianak',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->depotLainId = DB::table('depot_settings')->insertGetId([
            'kode_depo' => '0999',
            'region_id' => '002',
            'nama_depo' => 'Depo Region Lain',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('depot_settings')->insert([
            'kode_depo' => '0888',
            'region_id' => '001',
            'nama_depo' => 'Depo Nonaktif',
            'is_active' => false,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_region_valid_dikembalikan_tanpa_mengubah_session(): void
    {
        $response = $this->postJson('/api/v1/region-validate', ['region_code' => '001']);

        $response->assertOk()
            ->assertJson([
                'valid' => true,
                'region_code' => '001',
                'region_name' => 'REGION JATAKALBAR',
            ])
            ->assertSessionMissing('region_code')
            ->assertSessionMissing('depo_id');
    }

    public function test_region_tidak_dikenal_ditolak(): void
    {
        $this->postJson('/api/v1/region-validate', ['region_code' => 'TIDAK-ADA'])
            ->assertNotFound()
            ->assertJson(['valid' => false]);
    }

    public function test_depo_di_luar_region_yang_dipilih_ditolak(): void
    {
        $this->withSession(['region_code' => '001'])
            ->postJson('/api/v1/depo-validate', ['kode_depo' => '0999'])
            ->assertNotFound()
            ->assertJson(['valid' => false]);
    }

    public function test_depo_valid_disimpan_di_session(): void
    {
        $response = $this->withSession(['region_code' => '001'])
            ->postJson('/api/v1/depo-validate', ['kode_depo' => '0126']);

        $response->assertOk()
            ->assertJson([
                'valid' => true,
                'kode_depo' => '0126',
                'depo_name' => 'Depo Pontianak',
            ])
            ->assertSessionHas('depo_id', $this->depotPontianakId)
            ->assertSessionHas('kode_depo', '0126');
    }

    public function test_depo_options_hanya_mengembalikan_depo_aktif_di_region(): void
    {
        $response = $this->withSession([
            'region_code' => '001',
            'region_name' => 'REGION JATAKALBAR',
        ])->getJson('/api/v1/depo-options');

        $response->assertOk()
            ->assertJsonPath('region_code', '001')
            ->assertJsonCount(1, 'depos')
            ->assertJsonPath('depos.0.kode_depo', '0126');
    }

    public function test_depo_options_ditolak_tanpa_region(): void
    {
        $this->getJson('/api/v1/depo-options')->assertForbidden();
    }

    public function test_login_context_memetrikan_user_ke_depo_yang_dipilih(): void
    {
        $user = $this->makeUser('staff@example.com', $this->depotPontianakId, '0126');

        $response = $this->withAccessContext()
            ->postJson('/api/v1/login-with-context', [
                'email' => 'staff@example.com',
                'password' => 'secret',
            ]);

        $response->assertOk()
            ->assertJsonPath('user.email', 'staff@example.com')
            ->assertJsonStructure(['user', 'permissions']);

        $this->assertAuthenticatedAs($user);
    }

    public function test_login_context_menolak_password_salah_dengan_422(): void
    {
        $this->makeUser('staff@example.com', $this->depotPontianakId, '0126');

        $this->withAccessContext()
            ->postJson('/api/v1/login-with-context', [
                'email' => 'staff@example.com',
                'password' => 'salah',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->assertGuest();
    }

    public function test_login_context_menolak_user_dari_depo_lain(): void
    {
        $this->makeUser('staff@example.com', $this->depotLainId, '0999');

        $this->withAccessContext()
            ->postJson('/api/v1/login-with-context', [
                'email' => 'staff@example.com',
                'password' => 'secret',
            ])
            ->assertForbidden();

        $this->assertGuest();
    }

    public function test_login_context_mengizinkan_master_memilih_depo_mana_pun(): void
    {
        $user = User::factory()->adminMaster()->create([
            'email' => 'master@example.com',
            'password' => Hash::make('secret'),
            'status' => 'active',
            'region_id' => '001',
        ]);
        $user->forceFill(['depo_id' => null, 'kode_depo' => 'ADMIN'])->save();

        $this->withAccessContext()
            ->postJson('/api/v1/login-with-context', [
                'email' => 'master@example.com',
                'password' => 'secret',
            ])
            ->assertOk();

        $this->assertAuthenticatedAs($user);
    }

    public function test_login_context_ditolak_tanpa_konteks_region_depo(): void
    {
        $this->postJson('/api/v1/login-with-context', [
            'email' => 'staff@example.com',
            'password' => 'secret',
        ])->assertForbidden();
    }

    private function makeUser(string $email, int $depoId, string $kodeDepo): User
    {
        $user = User::factory()->create([
            'email' => $email,
            'password' => Hash::make('secret'),
            'status' => 'active',
            'scope_level' => 'depot',
            'region_id' => '001',
            'kode_depo' => $kodeDepo,
            'nama_depo' => $kodeDepo === '0126' ? 'Depo Pontianak' : 'Depo Lain',
        ]);
        $user->forceFill(['depo_id' => $depoId])->save();

        return $user;
    }

    private function withAccessContext(): static
    {
        return $this->withSession([
            'region_id' => '001',
            'region_code' => '001',
            'region_name' => 'REGION JATAKALBAR',
            'depo_id' => $this->depotPontianakId,
            'kode_depo' => '0126',
            'depo_nama' => 'Depo Pontianak',
        ]);
    }
}
