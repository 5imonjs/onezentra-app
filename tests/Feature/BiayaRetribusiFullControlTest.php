<?php

namespace Tests\Feature;

use App\Models\BiayaRetribusi;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiayaRetribusiFullControlTest extends TestCase
{
    use RefreshDatabase;

    private User $master;

    private User $editor;

    protected function setUp(): void
    {
        parent::setUp();

        $masterRole = Role::firstOrCreate(['slug' => 'biaya_retribusi_master'], ['name' => 'Biaya Retribusi Master']);
        foreach (['biaya_retribusi.view', 'biaya_retribusi.create', 'biaya_retribusi.edit', 'biaya_retribusi.delete', 'biaya_retribusi.full_control'] as $slug) {
            $masterRole->permissions()->syncWithoutDetaching([
                Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Biaya Retribusi'])->id,
            ]);
        }

        $this->master = $this->makeUser('biaya-retribusi-master@test.com', $masterRole);

        $editorRole = Role::firstOrCreate(['slug' => 'biaya_retribusi_editor'], ['name' => 'Biaya Retribusi Editor']);
        foreach (['biaya_retribusi.view', 'biaya_retribusi.create', 'biaya_retribusi.edit', 'biaya_retribusi.delete'] as $slug) {
            $editorRole->permissions()->syncWithoutDetaching([
                Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Biaya Retribusi'])->id,
            ]);
        }

        $this->editor = $this->makeUser('biaya-retribusi-editor@test.com', $editorRole);
    }

    public function test_pending_submission_cannot_be_updated_without_full_control(): void
    {
        Sanctum::actingAs($this->editor);

        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 100000,
            'created_by' => $this->master->id,
            'status' => 'pending',
        ]);

        $this->putJson("/api/v1/biaya-retribusi/{$biaya->id}", [
            'tanggal_pengajuan' => '2026-09-24',
            'details' => [],
        ])->assertStatus(403);
    }

    public function test_pending_submission_cannot_be_deleted_without_full_control(): void
    {
        Sanctum::actingAs($this->editor);

        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 100000,
            'created_by' => $this->master->id,
            'status' => 'pending',
        ]);

        $this->deleteJson("/api/v1/biaya-retribusi/{$biaya->id}")->assertStatus(422);
        $this->assertModelExists($biaya);
    }

    public function test_approved_submission_can_be_deleted_with_full_control(): void
    {
        Sanctum::actingAs($this->master);

        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 100000,
            'created_by' => $this->master->id,
            'status' => 'approved',
        ]);

        $this->deleteJson("/api/v1/biaya-retribusi/{$biaya->id}")->assertOk();
        $this->assertModelMissing($biaya);
    }

    public function test_pending_submission_can_be_deleted_with_full_control(): void
    {
        Sanctum::actingAs($this->master);

        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 100000,
            'created_by' => $this->master->id,
            'status' => 'pending',
        ]);

        $this->deleteJson("/api/v1/biaya-retribusi/{$biaya->id}")->assertOk();
        $this->assertModelMissing($biaya);
    }

    private function makeUser(string $email, Role $role): User
    {
        $user = User::create([
            'email' => $email,
            'password' => 'password',
            'full_name' => 'User',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'admin_master',
            'status' => 'active',
            'role_id' => $role->id,
        ]);
        $role->users()->attach($user->id);

        return $user;
    }
}
