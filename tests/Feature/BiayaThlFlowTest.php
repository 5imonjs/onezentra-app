<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiayaThlFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'biaya_thl_admin'], ['name' => 'Biaya THL Admin']);
        foreach (['biaya_thl.view', 'biaya_thl.create', 'biaya_thl.edit', 'biaya_thl.delete'] as $slug) {
            $permission = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Biaya']);
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }

        $this->user = User::create([
            'email' => 'biaya-thl@test.com',
            'password' => 'password',
            'full_name' => 'Biaya THL User',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'admin_master',
            'status' => 'active',
            'role_id' => $role->id,
        ]);
        $role->users()->attach($this->user->id);
    }

    public function test_store_accepts_thl_gudang_defaults_and_keeps_kubikasi_base_in_sync(): void
    {
        Sanctum::actingAs($this->user);

        $payload = [
            'tanggal_pengajuan' => '2026-09-17',
            'details' => [
                [
                    'no_surat_jalan' => 'SJ-001',
                    'nama_thl' => 'Budi',
                    'driver_name' => 'Andi',
                    'nopol_kendaraan' => 'KB 1234 XX',
                    'type_kendaraan' => 'CDD',
                    'nominal_biaya' => 150000,
                    'kubikasi' => 1.5,
                    'droppoint' => 'Terminal A',
                    'posisi' => 'THL HELPER',
                    'jam_datang' => '2026-09-17T08:00',
                    'jam_pulang' => '2026-09-17T17:00',
                    'kendaraan_tambahan' => false,
                    'order' => 0,
                ],
                [
                    'no_surat_jalan' => 'SJ-001',
                    'nama_thl' => 'Gudang',
                    'driver_name' => '',
                    'nopol_kendaraan' => 'KB 8888 ZZ',
                    'type_kendaraan' => 'Box',
                    'nominal_biaya' => 50000,
                    'kubikasi' => 0,
                    'droppoint' => '0',
                    'posisi' => 'THL GUDANG',
                    'jam_datang' => '2026-09-17T08:00',
                    'jam_pulang' => '2026-09-17T17:00',
                    'kendaraan_tambahan' => true,
                    'order' => 1,
                ],
            ],
        ];

        $response = $this->postJson('/api/v1/biaya-thl', $payload);

        $response->assertCreated();
        $this->assertEqualsWithDelta(1.5, (float) $response->json('data.kubikasi_base'), 0.001);
        $this->assertSame('0', $response->json('data.details.1.droppoint'));
        $this->assertSame(0.0, (float) $response->json('data.details.1.kubikasi'));
        $this->assertSame('2026-09-17T08:00', substr((string) $response->json('data.details.1.jam_datang'), 0, 16));
        $this->assertSame('2026-09-17T17:00', substr((string) $response->json('data.details.1.jam_pulang'), 0, 16));
        $this->assertDatabaseHas('biaya_thls', ['kubikasi_base' => '1.50']);
    }

    public function test_store_rejects_thl_gudang_without_work_hours(): void
    {
        Sanctum::actingAs($this->user);

        $payload = [
            'tanggal_pengajuan' => '2026-09-17',
            'details' => [
                [
                    'no_surat_jalan' => 'SJ-002',
                    'nama_thl' => 'Gudang',
                    'driver_name' => '',
                    'nopol_kendaraan' => 'KB 8888 ZZ',
                    'type_kendaraan' => 'Box',
                    'nominal_biaya' => 50000,
                    'kubikasi' => 0,
                    'droppoint' => '0',
                    'posisi' => 'THL GUDANG',
                    'jam_datang' => null,
                    'jam_pulang' => null,
                    'kendaraan_tambahan' => false,
                    'order' => 0,
                ],
            ],
        ];

        $response = $this->postJson('/api/v1/biaya-thl', $payload);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['details.0.jam_datang', 'details.0.jam_pulang']);
    }
}
