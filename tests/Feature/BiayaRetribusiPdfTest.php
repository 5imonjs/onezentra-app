<?php

namespace Tests\Feature;

use App\Models\BiayaRetribusi;
use App\Models\BiayaThl;
use App\Models\BiayaThlDetail;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BiayaRetribusiPdfTest extends TestCase
{
    use RefreshDatabase;

    public function test_retribusi_pdf_contains_both_claim_forms(): void
    {
        $permission = Permission::create([
            'slug' => 'biaya_retribusi.view',
            'name' => 'Biaya Retribusi View',
            'menu_group' => 'Biaya',
        ]);
        $thlPermission = Permission::create([
            'slug' => 'biaya_thl.view',
            'name' => 'Biaya THL View',
            'menu_group' => 'Biaya',
        ]);
        $role = Role::create(['slug' => 'biaya_retribusi_pdf', 'name' => 'Biaya Retribusi PDF']);
        $role->permissions()->attach([$permission->id, $thlPermission->id]);
        $user = User::create([
            'email' => 'biaya-retribusi-pdf@test.com',
            'password' => 'password',
            'full_name' => 'PDF User',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'admin_master',
            'status' => 'active',
            'role_id' => $role->id,
        ]);
        $role->users()->attach($user->id);

        $biayaThl = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-17',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 131000,
            'created_by' => $user->id,
        ]);
        $thlDetail = BiayaThlDetail::create([
            'biaya_thl_id' => $biayaThl->id,
            'nama_thl' => 'Budi',
            'nopol_kendaraan' => 'KB 1234 XX',
            'type_kendaraan' => 'CDD',
            'kubikasi' => 7.1,
            'droppoint' => '36',
            'posisi' => 'THL HELPER',
            'jam_datang' => '2026-09-17 08:00:00',
            'jam_pulang' => '2026-09-17 19:00:00',
            'nominal_biaya' => 131000,
        ]);
        $biayaRetribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-17',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 131000,
            'approval_pengajuan' => 'PDF User',
            'approval_pengajuan_level' => 'admin_master',
            'created_by' => $user->id,
        ]);
        $biayaRetribusi->details()->create([
            'biaya_thl_id' => $biayaThl->id,
            'biaya_thl_detail_id' => $thlDetail->id,
            'nopol_kendaraan' => 'KB 1234 XX',
            'type_kendaraan' => 'CDD',
            'no_surat_jalan' => 'SJ-001',
            'nominal_biaya' => 131000,
        ]);

        $response = $this->actingAs($user)->get('/api/v1/biaya-retribusi/'.$biayaRetribusi->id.'/pdf');

        $response->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $response->getContent());

        $thlResponse = $this->actingAs($user)->get('/api/v1/biaya-thl/'.$biayaThl->id.'/pdf');
        $thlResponse->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $thlResponse->getContent());

        $biayaThl->update([
            'status' => 'pending',
            'submitted_at' => '2026-09-22 10:15:00',
        ]);

        $html = view('pdf.biaya_retribusi_combined', [
            'biayaRetribusi' => $biayaRetribusi->load('details.biayaThlDetail.photos', 'documents'),
            'approvalSections' => [
                ['title' => 'Mengajukan', 'people' => [['name' => 'PDF User', 'role' => 'BLC']]],
                ['title' => 'Mengetahui', 'people' => [['name' => 'Manager', 'role' => 'BAC']]],
                ['title' => 'Menyetujui', 'people' => [['name' => 'RLH', 'role' => 'RLH']]],
            ],
            'stamps' => [
                'Mengajukan' => [
                    'text' => 'PENGAJUAN',
                    'color' => '#15803d',
                    'date' => '22 Sep 2026',
                ],
            ],
        ])->render();

        $this->assertStringContainsString('FORM KLAIM BIAYA PENGAJUAN RETRIBUSI', $html);
        $this->assertStringContainsString('FORM KLAIM TENAGA HARIAN LEPAS', $html);
        $this->assertStringContainsString('Budi', $html);
        $this->assertStringContainsString('admin_master', $html);
        $this->assertStringContainsString('PENGAJUAN', $html);
        $this->assertStringContainsString('22 Sep 2026', $html);

        $biayaThl->update([
            'status' => 'checked',
            'checked_at' => '2026-09-22 11:15:00',
            'checked_by' => null,
        ]);

        $checkedPdf = $this->actingAs($user)->get('/api/v1/biaya-thl/'.$biayaThl->id.'/pdf');

        $checkedPdf->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $checkedPdf->getContent());

        $biayaThl->update([
            'status' => 'rlh_approved',
            'rlh_approved_at' => '2026-09-22 12:15:00',
            'rlh_approved_by' => null,
        ]);

        $rlhPdf = $this->actingAs($user)->get('/api/v1/biaya-thl/'.$biayaThl->id.'/pdf');

        $rlhPdf->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $rlhPdf->getContent());
    }
}
