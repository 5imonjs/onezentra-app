<?php

namespace Tests\Feature;

use App\Models\BiayaThlPdfSetting;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiayaThlPdfSettingTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(array $permSlugs): User
    {
        $role = Role::firstOrCreate(['slug' => 'pdf_setting_test'], ['name' => 'PDF Setting Test']);
        foreach ($permSlugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => 'pdf-'.uniqid().'@test.com', 'password' => 'password', 'full_name' => 'PDF User',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'level' => 'staff_logistic', 'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function sections(): array
    {
        return [
            ['title' => 'Mengajukan', 'people' => [['name' => 'Nama BLC', 'role' => 'BLC']]],
            ['title' => 'Menyetujui', 'people' => [['name' => 'Nama RLH', 'role' => 'RLH']]],
        ];
    }

    public function test_index_requires_view_permission(): void
    {
        Sanctum::actingAs($this->userWith([]));

        $this->getJson('/api/v1/settings/biaya-thl-pdf')->assertForbidden();
    }

    public function test_upsert_validates_sections_shape(): void
    {
        Sanctum::actingAs($this->userWith(['biaya_thl.view', 'biaya_thl.edit']));

        $this->postJson('/api/v1/settings/biaya-thl-pdf', [
            'kode_depo' => 'DPO',
            'approval_sections' => [['title' => 'Mengajukan', 'people' => []]],
        ])->assertJsonValidationErrors(['approval_sections.0.people']);
    }

    public function test_upsert_persists_and_index_returns_by_depot(): void
    {
        Sanctum::actingAs($this->userWith(['biaya_thl.view', 'biaya_thl.edit']));

        $this->postJson('/api/v1/settings/biaya-thl-pdf', [
            'kode_depo' => 'DPO',
            'approval_sections' => $this->sections(),
        ])->assertOk()->assertJsonPath('data.kode_depo', 'DPO');

        $this->assertDatabaseHas('biaya_thl_pdf_settings', ['kode_depo' => 'DPO']);

        $res = $this->getJson('/api/v1/settings/biaya-thl-pdf?kode_depo=DPO')->assertOk();
        $this->assertSame('Nama BLC', $res->json('data.approval_sections.0.people.0.name'));

        // Upsert kedua menimpa, bukan menambah baris.
        $this->postJson('/api/v1/settings/biaya-thl-pdf', [
            'kode_depo' => 'DPO',
            'approval_sections' => $this->sections(),
        ])->assertOk();
        $this->assertSame(1, BiayaThlPdfSetting::where('kode_depo', 'DPO')->count());
    }

    public function test_upsert_rejects_foreign_depot_for_scoped_user(): void
    {
        Sanctum::actingAs($this->userWith(['biaya_thl.view', 'biaya_thl.edit']));

        $this->postJson('/api/v1/settings/biaya-thl-pdf', [
            'kode_depo' => 'OTHER',
            'approval_sections' => $this->sections(),
        ])->assertForbidden();

        $this->assertDatabaseMissing('biaya_thl_pdf_settings', ['kode_depo' => 'OTHER']);
    }

    public function test_index_ignores_foreign_depot_for_scoped_user(): void
    {
        BiayaThlPdfSetting::create(['kode_depo' => 'OTHER', 'approval_sections' => $this->sections()]);
        Sanctum::actingAs($this->userWith(['biaya_thl.view', 'biaya_thl.edit']));

        // Meminta depo asing diabaikan; depo sendiri belum punya setting.
        $this->getJson('/api/v1/settings/biaya-thl-pdf?kode_depo=OTHER')
            ->assertOk()
            ->assertJsonPath('data', null);
    }
}
