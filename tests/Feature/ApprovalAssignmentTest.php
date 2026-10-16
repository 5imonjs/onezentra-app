<?php

namespace Tests\Feature;

use App\Models\ApprovalAssignment;
use App\Models\BiayaThl;
use App\Models\BiayaThlDetail;
use App\Models\BiayaThlPhoto;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\ApprovalSectionResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApprovalAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private function approvalPermissions(): array
    {
        return Permission::whereIn('slug', ['approval.view', 'approval.manage', 'approval.submit', 'approval.check', 'approval.approve', 'approval.reject', 'approval.revise'])
            ->get()
            ->keyBy('slug')
            ->all();
    }

    public function test_admin_can_assign_active_users_for_each_approval_level(): void
    {
        $permission = Permission::create(['slug' => 'biaya_thl.view', 'name' => 'THL View', 'menu_group' => 'Biaya']);
        $editPermission = Permission::create(['slug' => 'biaya_thl.edit', 'name' => 'THL Edit', 'menu_group' => 'Biaya']);
        $managePermission = $this->approvalPermissions()['approval.manage'];
        $role = Role::create(['slug' => 'approval_admin', 'name' => 'Approval Admin']);
        $role->permissions()->attach([$permission->id, $editPermission->id, $managePermission->id]);
        $admin = User::create([
            'email' => 'approval-admin@test.com', 'password' => 'password', 'full_name' => 'Admin',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'admin_master',
            'status' => 'active', 'role_id' => $role->id,
        ]);
        $role->users()->attach($admin->id);
        $approvers = collect(['BAC' => 'BAC User', 'RLH' => 'RLH User', 'RFAH' => 'RFAH User'])->map(fn (string $name, string $level): User => User::create([
            'email' => strtolower($level).'@test.com', 'password' => 'password', 'full_name' => $name,
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'staff_logistic', 'status' => 'active',
        ]));

        Sanctum::actingAs($admin);
        $response = $this->postJson('/api/v1/approval-assignments', [
            'kode_depo' => 'DPT-A',
            'assignments' => $approvers->map(fn (User $approver, string $level): array => ['approval_level' => $level, 'user_id' => $approver->id])->values()->all(),
        ]);

        $response->assertOk();
        $this->assertSame(3, ApprovalAssignment::count());
        $this->assertSame('BAC User', ApprovalAssignment::where('approval_level', 'BAC')->first()->user->full_name);
        $sections = app(ApprovalSectionResolver::class)->resolve('DPT-A', 'Submitter');
        // Nama assignee tetap ditampilkan, tetapi stamp hanya muncul setelah
        // aksi approval benar-benar tercatat.
        $this->assertSame('Submitter', $sections[0]['people'][0]['name']);
        $this->assertSame('RLH User', $sections[2]['people'][0]['name']);
        $resolved = app(ApprovalSectionResolver::class)->resolve('DPT-A', 'Submitter', 'BAC User', 'RLH User', 'RFAH User');
        $this->assertSame('BAC User', $resolved[1]['people'][0]['name']);
        $this->assertSame('RLH User', $resolved[2]['people'][0]['name']);
        $this->assertSame('RFAH User', $resolved[3]['people'][0]['name']);
    }

    public function test_scoped_admin_cannot_assign_an_approver_from_another_depot(): void
    {
        $permission = Permission::create(['slug' => 'biaya_thl.edit', 'name' => 'THL Edit', 'menu_group' => 'Biaya']);
        $managePermission = $this->approvalPermissions()['approval.manage'];
        $role = Role::create(['slug' => 'approval_scoped', 'name' => 'Approval Scoped']);
        $role->permissions()->attach([$permission->id, $managePermission->id]);
        $admin = User::create([
            'email' => 'scoped-admin@test.com', 'password' => 'password', 'full_name' => 'Admin',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'operator',
            'status' => 'active', 'role_id' => $role->id,
        ]);
        $role->users()->attach($admin->id);
        $approver = User::create([
            'email' => 'other-depot@test.com', 'password' => 'password', 'full_name' => 'Other',
            'kode_depo' => 'DPT-B', 'nama_depo' => 'Depo B', 'level' => 'staff_logistic', 'status' => 'active',
        ]);

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/approval-assignments', [
            'kode_depo' => 'DPT-A',
            'assignments' => [['approval_level' => 'BAC', 'user_id' => $approver->id]],
        ])->assertStatus(422);
    }

    public function test_index_dapat_dibaca_tanpa_approval_view_untuk_depo_sendiri(): void
    {
        // Regresi: preview PDF memanggil endpoint ini untuk nama approver —
        // BLC (tanpa approval.view) 403 sehingga toast "tidak memiliki izin"
        // muncul walau preview sebenarnya punya fallback. Proteksi tersisa:
        // canAccessDepot (403 lintas depo), bukan permission.
        $role = Role::create(['slug' => 'plain_blc', 'name' => 'Plain BLC']);
        $blc = User::create([
            'email' => 'plain-blc@test.com', 'password' => 'password', 'full_name' => 'Blc',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'blc',
            'status' => 'active',
        ]);
        $role->users()->attach($blc->id);

        Sanctum::actingAs($blc);
        $this->getJson('/api/v1/approval-assignments?kode_depo=DPT-A&module=biaya_retribusi')
            ->assertOk()
            ->assertJsonStructure(['data', 'depots', 'users', 'levels']);
        $this->getJson('/api/v1/approval-assignments?kode_depo=DPT-B&module=biaya_retribusi')
            ->assertForbidden();
    }

    public function test_global_rlh_assignment_sees_and_can_approve_depot_submission(): void
    {
        $viewPermission = Permission::create(['slug' => 'biaya_thl.view', 'name' => 'THL View', 'menu_group' => 'Biaya']);
        $approvePermission = $this->approvalPermissions()['approval.approve'];
        $role = Role::create(['slug' => 'global_rlh', 'name' => 'Global RLH']);
        $role->permissions()->attach([$viewPermission->id, $approvePermission->id]);
        $rlh = User::create([
            'email' => 'global-rlh@test.com', 'password' => 'password', 'full_name' => 'Global RLH',
            'kode_depo' => 'RLH-01', 'nama_depo' => 'Depo RLH', 'level' => 'rlh', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $role->users()->attach($rlh->id);
        ApprovalAssignment::create(['kode_depo' => 'ADMIN', 'approval_level' => 'RLH', 'user_id' => $rlh->id, 'is_active' => true]);
        $submitter = User::create([
            'email' => 'global-rlh-submitter@test.com', 'password' => 'password', 'full_name' => 'Submitter',
            'kode_depo' => '0127', 'nama_depo' => 'Singkawang', 'level' => 'staff_logistic', 'status' => 'active',
        ]);
        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-23', 'kode_depo' => '0127', 'nama_depo' => 'Singkawang',
            'status' => 'checked', 'nominal_biaya' => 100000, 'created_by' => $submitter->id,
        ]);

        Sanctum::actingAs($rlh);
        $this->getJson('/api/v1/biaya-thl')->assertOk()->assertJsonPath('data.0.id', $biaya->id);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/approve")->assertOk();

        $this->assertDatabaseHas('biaya_thls', ['id' => $biaya->id, 'status' => 'approved']);
    }

    public function test_assigned_users_can_complete_the_approval_transition(): void
    {
        $approvalPermissions = $this->approvalPermissions();
        $role = Role::create(['slug' => 'workflow_admin', 'name' => 'Workflow Admin']);
        $role->permissions()->attach(array_values($approvalPermissions));
        $submitter = User::create([
            'email' => 'workflow-submit@test.com', 'password' => 'password', 'full_name' => 'Submitter',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'admin_master', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $checker = User::create([
            'email' => 'workflow-check@test.com', 'password' => 'password', 'full_name' => 'Checker',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'staff_logistic', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $approver = User::create([
            'email' => 'workflow-approve@test.com', 'password' => 'password', 'full_name' => 'Approver',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'staff_logistic', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $role->users()->attach([$submitter->id, $checker->id, $approver->id]);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'BAC', 'user_id' => $checker->id]);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'RLH', 'user_id' => $approver->id]);
        $biaya = BiayaThl::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'created_by' => $submitter->id]);
        $detail = BiayaThlDetail::create([
            'biaya_thl_id' => $biaya->id,
            'no_surat_jalan' => 'SJ-001',
            'nama_thl' => 'Budi',
            'driver_name' => 'Andi',
            'nopol_kendaraan' => 'KB 1234 XX',
            'type_kendaraan' => 'CDD',
            'nominal_biaya' => 150000,
            'kubikasi' => 1.5,
            'droppoint' => 'Terminal A',
            'posisi' => 'THL HELPER',
            'jam_datang' => '2026-09-18 08:00:00',
            'jam_pulang' => '2026-09-18 17:00:00',
            'order' => 0,
        ]);
        BiayaThlPhoto::create([
            'biaya_thl_id' => $biaya->id,
            'biaya_thl_detail_id' => $detail->id,
            'file_path' => 'biaya_thl/test/bukti.jpg',
            'file_name' => 'bukti.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'order' => 0,
        ]);

        $this->actingAs($submitter)->postJson("/api/v1/biaya-thl/{$biaya->id}/submit")->assertOk();
        $this->assertDatabaseHas('biaya_thls', ['id' => $biaya->id, 'approval_pengajuan_level' => 'admin_master']);
        $this->actingAs($checker)->postJson("/api/v1/biaya-thl/{$biaya->id}/check")->assertOk();
        $this->actingAs($approver)->postJson("/api/v1/biaya-thl/{$biaya->id}/approve")->assertOk();

        $this->assertDatabaseHas('biaya_thls', [
            'id' => $biaya->id,
            'status' => 'approved',
            'checked_by' => $checker->id,
            'approved_by' => $approver->id,
        ]);
    }

    public function test_assigned_users_can_request_revision_then_resubmit_for_approval(): void
    {
        $approvalPermissions = $this->approvalPermissions();
        $role = Role::create(['slug' => 'revisi_admin', 'name' => 'Revisi Admin']);
        $role->permissions()->attach(array_values($approvalPermissions));
        $submitter = User::create([
            'email' => 'revisi-submit@test.com', 'password' => 'password', 'full_name' => 'Submitter',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'admin_master', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $checker = User::create([
            'email' => 'revisi-check@test.com', 'password' => 'password', 'full_name' => 'Checker',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'staff_logistic', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $approver = User::create([
            'email' => 'revisi-approve@test.com', 'password' => 'password', 'full_name' => 'Approver',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'staff_logistic', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $role->users()->attach([$submitter->id, $checker->id, $approver->id]);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'BAC', 'user_id' => $checker->id]);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'RLH', 'user_id' => $approver->id]);
        $biaya = BiayaThl::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'created_by' => $submitter->id]);
        $detail = BiayaThlDetail::create([
            'biaya_thl_id' => $biaya->id,
            'no_surat_jalan' => 'SJ-001',
            'nama_thl' => 'Budi',
            'driver_name' => 'Andi',
            'nopol_kendaraan' => 'KB 1234 XX',
            'type_kendaraan' => 'CDD',
            'nominal_biaya' => 150000,
            'kubikasi' => 1.5,
            'droppoint' => 'Terminal A',
            'posisi' => 'THL HELPER',
            'jam_datang' => '2026-09-18 08:00:00',
            'jam_pulang' => '2026-09-18 17:00:00',
            'order' => 0,
        ]);
        BiayaThlPhoto::create([
            'biaya_thl_id' => $biaya->id,
            'biaya_thl_detail_id' => $detail->id,
            'file_path' => 'biaya_thl/test/bukti.jpg',
            'file_name' => 'bukti.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'order' => 0,
        ]);

        $this->actingAs($submitter)->postJson("/api/v1/biaya-thl/{$biaya->id}/submit")->assertOk();
        $this->actingAs($checker)->postJson("/api/v1/biaya-thl/{$biaya->id}/check")->assertOk();

        $this->actingAs($approver)
            ->postJson("/api/v1/biaya-thl/{$biaya->id}/revise", ['reason' => 'Nama THL belum diisi'])
            ->assertOk();

        $this->assertDatabaseHas('biaya_thls', [
            'id' => $biaya->id,
            'status' => 'revisi',
            'revised_by' => $approver->id,
            'revisi_reason' => 'Nama THL belum diisi',
        ]);

        $this->actingAs($submitter)->postJson("/api/v1/biaya-thl/{$biaya->id}/submit")->assertOk();
        $this->assertDatabaseHas('biaya_thls', [
            'id' => $biaya->id,
            'status' => 'checked',
            'revised_by' => $approver->id,
            'revisi_reason' => 'Nama THL belum diisi',
            'resubmitted_by' => $submitter->id,
            'rlh_approved_by' => null,
            'rlh_approved_at' => null,
            'approved_by' => null,
            'approved_at' => null,
        ]);

        $this->actingAs($approver)->postJson("/api/v1/biaya-thl/{$biaya->id}/approve")->assertOk();

        $this->assertDatabaseHas('biaya_thls', ['id' => $biaya->id, 'status' => 'approved']);
    }

    public function test_creator_cannot_approve_their_own_submission(): void
    {
        $approvalPermissions = $this->approvalPermissions();
        $role = Role::create(['slug' => 'self_approve_admin', 'name' => 'Self Approve Admin']);
        $role->permissions()->attach(array_values($approvalPermissions));
        $creator = User::create([
            'email' => 'self-approve@test.com', 'password' => 'password', 'full_name' => 'Creator',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'staff_logistic', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $role->users()->attach($creator->id);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'BAC', 'user_id' => $creator->id]);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'RLH', 'user_id' => $creator->id]);
        $biaya = BiayaThl::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'status' => 'pending', 'created_by' => $creator->id]);

        Sanctum::actingAs($creator);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/check")
            ->assertForbidden()
            ->assertJsonFragment(['message' => 'Pembuat pengajuan tidak boleh memproses pengajuannya sendiri.']);

        $this->assertDatabaseHas('biaya_thls', ['id' => $biaya->id, 'status' => 'pending', 'checked_by' => null]);
    }

    public function test_creator_cannot_reject_their_own_submission(): void
    {
        $approvalPermissions = $this->approvalPermissions();
        $role = Role::create(['slug' => 'self_reject_admin', 'name' => 'Self Reject Admin']);
        $role->permissions()->attach(array_values($approvalPermissions));
        $creator = User::create([
            'email' => 'self-reject@test.com', 'password' => 'password', 'full_name' => 'Creator',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'staff_logistic', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $role->users()->attach($creator->id);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'BAC', 'user_id' => $creator->id]);
        $biaya = BiayaThl::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'status' => 'pending', 'created_by' => $creator->id]);

        Sanctum::actingAs($creator);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/reject", ['reason' => 'Uji'])
            ->assertForbidden();

        $this->assertDatabaseHas('biaya_thls', ['id' => $biaya->id, 'status' => 'pending']);
    }
}
