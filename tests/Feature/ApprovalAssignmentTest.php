<?php

namespace Tests\Feature;

use App\Models\ApprovalAssignment;
use App\Models\BiayaThl;
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
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'admin',
            'status' => 'active', 'role_id' => $role->id,
        ]);
        $role->users()->attach($admin->id);
        $approvers = collect(['BAC' => 'BAC User', 'RLH' => 'RLH User', 'RFAH' => 'RFAH User'])->map(fn (string $name, string $level): User => User::create([
            'email' => strtolower($level).'@test.com', 'password' => 'password', 'full_name' => $name,
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => $level === 'BAC' ? 'supervisor' : ($level === 'RLH' ? 'supervisor' : 'supervisor'), 'status' => 'active',
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
        $this->assertSame('RLH User', $sections[2]['people'][0]['name']);
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
            'kode_depo' => 'DPT-B', 'nama_depo' => 'Depo B', 'level' => 'supervisor', 'status' => 'active',
        ]);

        Sanctum::actingAs($admin);
        $this->postJson('/api/v1/approval-assignments', [
            'kode_depo' => 'DPT-A',
            'assignments' => [['approval_level' => 'BAC', 'user_id' => $approver->id]],
        ])->assertStatus(422);
    }

    public function test_assigned_users_can_complete_the_approval_transition(): void
    {
        $approvalPermissions = $this->approvalPermissions();
        $role = Role::create(['slug' => 'workflow_admin', 'name' => 'Workflow Admin']);
        $role->permissions()->attach(array_values($approvalPermissions));
        $submitter = User::create([
            'email' => 'workflow-submit@test.com', 'password' => 'password', 'full_name' => 'Submitter',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'admin', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $checker = User::create([
            'email' => 'workflow-check@test.com', 'password' => 'password', 'full_name' => 'Checker',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'supervisor', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $approver = User::create([
            'email' => 'workflow-approve@test.com', 'password' => 'password', 'full_name' => 'Approver',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'supervisor', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $role->users()->attach([$submitter->id, $checker->id, $approver->id]);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'BAC', 'user_id' => $checker->id]);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'RLH', 'user_id' => $approver->id]);
        $biaya = BiayaThl::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'created_by' => $submitter->id]);

        $this->actingAs($submitter)->postJson("/api/v1/biaya-thl/{$biaya->id}/submit")->assertOk();
        $this->assertDatabaseHas('biaya_thls', ['id' => $biaya->id, 'approval_pengajuan_level' => 'admin']);
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
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'admin', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $checker = User::create([
            'email' => 'revisi-check@test.com', 'password' => 'password', 'full_name' => 'Checker',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'supervisor', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $approver = User::create([
            'email' => 'revisi-approve@test.com', 'password' => 'password', 'full_name' => 'Approver',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'supervisor', 'status' => 'active', 'role_id' => $role->id,
        ]);
        $role->users()->attach([$submitter->id, $checker->id, $approver->id]);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'BAC', 'user_id' => $checker->id]);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'RLH', 'user_id' => $approver->id]);
        $biaya = BiayaThl::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'created_by' => $submitter->id]);

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
            'status' => 'pending',
            'revised_by' => null,
            'revised_at' => null,
            'revisi_reason' => null,
        ]);

        $this->actingAs($checker)->postJson("/api/v1/biaya-thl/{$biaya->id}/check")->assertOk();
        $this->actingAs($approver)->postJson("/api/v1/biaya-thl/{$biaya->id}/approve")->assertOk();

        $this->assertDatabaseHas('biaya_thls', ['id' => $biaya->id, 'status' => 'approved']);
    }
}
