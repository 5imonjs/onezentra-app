<?php

namespace Tests\Feature;

use App\Models\ApprovalAssignment;
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
                    'color' => '#dc2626',
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

    public function test_retribusi_show_returns_actor_names_for_pdf_boxes(): void
    {
        $permission = Permission::create([
            'slug' => 'biaya_retribusi.view',
            'name' => 'Biaya Retribusi View',
            'menu_group' => 'Biaya',
        ]);
        $role = Role::create(['slug' => 'biaya_retribusi_show', 'name' => 'Biaya Retribusi Show']);
        $role->permissions()->attach($permission->id);

        $viewer = $this->retribusiUser('retribusi-show@test.com', 'Viewer Show', $role);
        $submitter = $this->retribusiUser('submitter@test.com', 'Pengaju Retribusi', null);
        $checker = $this->retribusiUser('checker@test.com', 'Checker Retribusi', null);
        $rlh = $this->retribusiUser('rlh@test.com', 'RLH Retribusi', null);
        $rfah = $this->retribusiUser('rfah@test.com', 'RFAH Retribusi', null);

        $biayaRetribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 250000,
            'approval_pengajuan' => 'Pengaju Retribusi',
            'status' => 'approved',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $submitter->id,
            'checked_at' => '2026-09-24 10:30:00',
            'checked_by' => $checker->id,
            'rlh_approved_at' => '2026-09-24 11:00:00',
            'rlh_approved_by' => $rlh->id,
            'approved_at' => '2026-09-24 13:00:00',
            'approved_by' => $rfah->id,
            'is_rfah_required' => true,
            'created_by' => $submitter->id,
        ]);

        $response = $this->actingAs($viewer)->getJson('/api/v1/biaya-retribusi/'.$biayaRetribusi->id);

        $response->assertOk();
        $response->assertJsonPath('data.submitted_by.full_name', 'Pengaju Retribusi');
        $response->assertJsonPath('data.checked_by.full_name', 'Checker Retribusi');
        $response->assertJsonPath('data.rlh_approved_by.full_name', 'RLH Retribusi');
        $response->assertJsonPath('data.approved_by.full_name', 'RFAH Retribusi');

        $sections = collect($response->json('data.approval_sections'))->keyBy('title');
        $this->assertSame('Pengaju Retribusi', $sections['Mengajukan']['people'][0]['name']);
        $this->assertSame('Checker Retribusi', $sections['Mengetahui']['people'][0]['name']);
        $this->assertSame('RLH Retribusi', $sections['Menyetujui']['people'][0]['name']);
        $this->assertSame('RFAH Retribusi', $sections['RFAH*']['people'][0]['name']);
    }

    public function test_retribusi_show_approval_sections_fill_assigned_names_for_pending(): void
    {
        $permission = Permission::create([
            'slug' => 'biaya_retribusi.view',
            'name' => 'Biaya Retribusi View',
            'menu_group' => 'Biaya',
        ]);
        $role = Role::create(['slug' => 'biaya_retribusi_show_pending', 'name' => 'Biaya Retribusi Show Pending']);
        $role->permissions()->attach($permission->id);

        $viewer = $this->retribusiUser('retribusi-pending@test.com', 'Viewer Pending', $role);
        $submitter = $this->retribusiUser('submitter-pending@test.com', 'Pengaju Pending', null);
        $bac = $this->retribusiUser('bac-pending@test.com', 'BAC Pending', null);
        $rlh = $this->retribusiUser('rlh-pending@test.com', 'RLH Pending', null);
        $rfah = $this->retribusiUser('rfah-pending@test.com', 'RFAH Pending', null);

        foreach ([['BAC', $bac], ['RLH', $rlh], ['RFAH', $rfah]] as [$level, $assignee]) {
            ApprovalAssignment::create([
                'module' => ApprovalAssignment::MODULE_RETRIBUSI,
                'kode_depo' => 'DPT-A',
                'approval_level' => $level,
                'user_id' => $assignee->id,
                'is_active' => true,
            ]);
        }

        $biayaRetribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 1250000,
            'approval_pengajuan' => 'Pengaju Pending',
            'status' => 'pending',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $submitter->id,
            'is_rfah_required' => true,
            'created_by' => $submitter->id,
        ]);

        $response = $this->actingAs($viewer)->getJson('/api/v1/biaya-retribusi/'.$biayaRetribusi->id);

        $response->assertOk();
        $sections = collect($response->json('data.approval_sections'))->keyBy('title');
        $this->assertSame('Pengaju Pending', $sections['Mengajukan']['people'][0]['name']);
        $this->assertSame('BAC Pending', $sections['Mengetahui']['people'][0]['name']);
        $this->assertSame('RLH Pending', $sections['Menyetujui']['people'][0]['name']);
        $this->assertSame('RFAH Pending', $sections['RFAH*']['people'][0]['name']);
    }

    public function test_retribusi_show_denies_thl_only_approver(): void
    {
        // Approver yang hanya ditugaskan untuk modul THL tidak boleh mengakses
        // detail retribusi (authorizeViewer harus mem-filter module).
        $permission = Permission::create([
            'slug' => 'biaya_retribusi.view',
            'name' => 'Biaya Retribusi View',
            'menu_group' => 'Biaya',
        ]);
        $role = Role::create(['slug' => 'biaya_retribusi_deny', 'name' => 'Biaya Retribusi Deny']);
        $role->permissions()->attach($permission->id);

        $rlhThlOnly = User::create([
            'email' => 'rlh-thl-only@test.com',
            'password' => 'password',
            'full_name' => 'RLH THL Only',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'rlh',
            'status' => 'active',
            'role_id' => $role->id,
        ]);
        $role->users()->attach($rlhThlOnly->id);
        ApprovalAssignment::create([
            'module' => ApprovalAssignment::MODULE_THL,
            'kode_depo' => 'DPT-A',
            'approval_level' => 'RLH',
            'user_id' => $rlhThlOnly->id,
            'is_active' => true,
        ]);

        // Pengaju retribusi adalah user lain; pelihat adalah approver THL-only.
        $submitter = User::create([
            'email' => 'submitter-retribusi@test.com',
            'password' => 'password',
            'full_name' => 'Submitter Retribusi',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        $biayaRetribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 250000,
            'approval_pengajuan' => 'Siapa Saja',
            'created_by' => $submitter->id,
        ]);

        $this->actingAs($rlhThlOnly)
            ->getJson('/api/v1/biaya-retribusi/'.$biayaRetribusi->id)
            ->assertStatus(403);
    }

    private function retribusiUser(string $email, string $fullName, ?Role $role): User
    {
        $user = User::create([
            'email' => $email,
            'password' => 'password',
            'full_name' => $fullName,
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'admin_master',
            'status' => 'active',
            'role_id' => $role?->id,
        ]);
        if ($role) {
            $role->users()->attach($user->id);
        }

        return $user;
    }
}
