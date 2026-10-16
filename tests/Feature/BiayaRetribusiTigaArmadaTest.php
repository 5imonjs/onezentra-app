<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\BiayaRetribusiController;
use App\Models\BiayaRetribusi;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Audit 3 armada pada pengajuan biaya retribusi: 1 baris = 1 kendaraan,
 * ketiga-tiganya harus tersimpan, terhitung, dan tampil tepat 1x di PDF
 * (tidak hilang, tidak double).
 */
class BiayaRetribusiTigaArmadaTest extends TestCase
{
    use RefreshDatabase;

    private function master(): User
    {
        Permission::firstOrCreate(['slug' => 'biaya_retribusi.create'], ['name' => 'Create', 'menu_group' => 'Test']);
        Permission::firstOrCreate(['slug' => 'biaya_retribusi.view'], ['name' => 'View', 'menu_group' => 'Test']);
        $role = Role::firstOrCreate(['slug' => 'tiga_armada'], ['name' => 'Tiga Armada']);
        $user = User::factory()->create(['level' => 'admin_master', 'status' => 'active']);
        $role->users()->attach($user->id);

        return $user;
    }

    /** @return array<int, array<string, mixed>> */
    private function tigaBaris(): array
    {
        return [
            ['nopol_kendaraan' => 'KB 9317 D', 'type_kendaraan' => 'CDD', 'no_surat_jalan' => 'SJ-587', 'nominal_biaya' => 131000],
            ['nopol_kendaraan' => 'KB 8340 CF', 'type_kendaraan' => 'CDD', 'no_surat_jalan' => 'SJ-589', 'nominal_biaya' => 132000],
            ['nopol_kendaraan' => 'B 9614 SCN', 'type_kendaraan' => 'CDD', 'no_surat_jalan' => 'SJ-588', 'nominal_biaya' => 133000],
        ];
    }

    public function test_store_tiga_armada_menyimpan_tiga_baris_dan_total_benar(): void
    {
        Sanctum::actingAs($this->master());

        $response = $this->postJson('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-10-16',
            'details' => $this->tigaBaris(),
        ]);

        $response->assertCreated();
        $id = $response->json('data.id');
        $this->assertSame(3, BiayaRetribusi::findOrFail($id)->details()->count());
        $this->assertSame(396000.0, (float) BiayaRetribusi::findOrFail($id)->nominal_biaya);
        $this->assertSame('SJ-587', BiayaRetribusi::findOrFail($id)->details()->orderBy('order')->first()->no_surat_jalan);
    }

    public function test_blade_tiga_armada_muncul_tepat_satu_kali_tanpa_double(): void
    {
        $user = $this->master();
        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-10-16',
            'kode_depo' => $user->kode_depo,
            'nama_depo' => $user->nama_depo,
            'nominal_biaya' => 396000,
            'approval_pengajuan' => $user->full_name,
            'approval_pengajuan_level' => 'admin_master',
            'created_by' => $user->id,
        ]);
        foreach ($this->tigaBaris() as $index => $row) {
            $biaya->details()->create(array_merge($row, ['order' => $index]));
        }

        $html = view('pdf.biaya_retribusi', [
            'biayaRetribusi' => $biaya->load('details', 'documents'),
            'approvalSections' => [
                ['title' => 'Mengajukan', 'people' => [['name' => $user->full_name, 'role' => 'BLC']]],
                ['title' => 'Mengetahui', 'people' => [['name' => '-', 'role' => 'BAC']]],
                ['title' => 'Menyetujui', 'people' => [['name' => '-', 'role' => 'RLH']]],
            ],
            'stamps' => app(BiayaRetribusiController::class)->resolveStamps($biaya),
        ])->render();

        foreach (['SJ-587', 'SJ-589', 'SJ-588', 'KB 9317 D', 'KB 8340 CF', 'B 9614 SCN'] as $token) {
            $this->assertSame(1, substr_count($html, $token), "{$token} harus muncul tepat 1x");
        }
    }

    public function test_sj_sama_antar_baris_tetap_diperbolehkan(): void
    {
        Sanctum::actingAs($this->master());
        $rows = $this->tigaBaris();
        $rows[1]['no_surat_jalan'] = 'SJ-587';

        $this->postJson('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-10-16',
            'details' => $rows,
        ])->assertCreated();
    }
}
