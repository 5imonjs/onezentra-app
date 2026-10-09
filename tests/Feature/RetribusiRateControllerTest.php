<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\RetribusiRate;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RetribusiRateControllerTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(array $permSlugs): User
    {
        $role = Role::firstOrCreate(['slug' => 'rate_test'], ['name' => 'Rate Test']);
        foreach ($permSlugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => 'rate-'.uniqid().'@test.com', 'password' => 'password', 'full_name' => 'Rate User',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'level' => 'staff_logistic', 'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_index_requires_manage_permission(): void
    {
        Sanctum::actingAs($this->userWith([]));

        $this->getJson('/api/v1/retribusi-rates')->assertForbidden();
    }

    public function test_upsert_koli_stores_rates(): void
    {
        Sanctum::actingAs($this->userWith(['retribusi_rates.manage']));

        $this->postJson('/api/v1/retribusi-rates', [
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test',
            'mode' => 'koli', 'rate_zak' => 1500, 'rate_crt' => 2500,
        ])->assertOk()->assertJsonPath('data.mode', 'koli');

        $this->assertDatabaseHas('retribusi_rates', [
            'kode_depo' => 'DPO', 'mode' => 'koli', 'rate_zak' => 1500, 'rate_crt' => 2500,
        ]);

        $this->getJson('/api/v1/retribusi-rates')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_upsert_borongan_zeroes_rate_zak(): void
    {
        Sanctum::actingAs($this->userWith(['retribusi_rates.manage']));

        $this->postJson('/api/v1/retribusi-rates', [
            'kode_depo' => 'DPO', 'mode' => 'borongan', 'rate_zak' => 9999, 'rate_crt' => 1000,
        ])->assertOk();

        $this->assertDatabaseHas('retribusi_rates', ['kode_depo' => 'DPO', 'mode' => 'borongan', 'rate_zak' => 0]);
    }

    public function test_upsert_rejects_unknown_mode(): void
    {
        Sanctum::actingAs($this->userWith(['retribusi_rates.manage']));

        $this->postJson('/api/v1/retribusi-rates', ['kode_depo' => 'DPO', 'mode' => 'harian'])
            ->assertJsonValidationErrors(['mode']);
    }

    public function test_destroy_removes_rate(): void
    {
        Sanctum::actingAs($this->userWith(['retribusi_rates.manage']));
        RetribusiRate::create(['kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'mode' => 'koli', 'rate_zak' => 1, 'rate_crt' => 1]);

        $this->deleteJson('/api/v1/retribusi-rates/DPO')->assertOk();
        $this->assertDatabaseMissing('retribusi_rates', ['kode_depo' => 'DPO']);
    }

    public function test_index_only_returns_own_depot_for_scoped_user(): void
    {
        Sanctum::actingAs($this->userWith(['retribusi_rates.manage']));
        RetribusiRate::create(['kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'mode' => 'koli', 'rate_zak' => 1, 'rate_crt' => 1]);
        RetribusiRate::create(['kode_depo' => 'OTHER', 'nama_depo' => 'Depo Lain', 'mode' => 'koli', 'rate_zak' => 2, 'rate_crt' => 2]);

        $this->getJson('/api/v1/retribusi-rates')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.kode_depo', 'DPO');
    }

    public function test_upsert_rejects_foreign_depot_for_scoped_user(): void
    {
        Sanctum::actingAs($this->userWith(['retribusi_rates.manage']));

        $this->postJson('/api/v1/retribusi-rates', [
            'kode_depo' => 'OTHER', 'mode' => 'koli', 'rate_zak' => 1, 'rate_crt' => 1,
        ])->assertForbidden();

        $this->assertDatabaseMissing('retribusi_rates', ['kode_depo' => 'OTHER']);
    }

    public function test_destroy_rejects_foreign_depot_for_scoped_user(): void
    {
        Sanctum::actingAs($this->userWith(['retribusi_rates.manage']));
        RetribusiRate::create(['kode_depo' => 'OTHER', 'nama_depo' => 'Depo Lain', 'mode' => 'koli', 'rate_zak' => 1, 'rate_crt' => 1]);

        $this->deleteJson('/api/v1/retribusi-rates/OTHER')->assertForbidden();
        $this->assertDatabaseHas('retribusi_rates', ['kode_depo' => 'OTHER']);
    }
}
