<?php

namespace Tests\Feature;

use App\Mail\BiayaApprovalNotification;
use App\Models\ApprovalAssignment;
use App\Models\BiayaRetribusi;
use App\Models\EmailRecipient;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiayaRetribusiApprovalEmailTest extends TestCase
{
    use RefreshDatabase;

    private function createApprovalUsers(): array
    {
        $role = Role::firstOrCreate(['slug' => 'biaya_retribusi_flow'], ['name' => 'Biaya Retribusi Flow']);
        $perms = ['approval.submit', 'approval.check', 'approval.approve', 'approval.rfah', 'approval.reject', 'approval.revise', 'emails.view', 'emails.edit'];
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $blc = User::create(['email' => 'blc-retribusi@test.com', 'password' => 'password', 'full_name' => 'BLC Retribusi', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'staff_logistic', 'status' => 'active', 'role_id' => $role->id]);
        $bac = User::create(['email' => 'bac-retribusi@test.com', 'password' => 'password', 'full_name' => 'BAC Checker', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'bac', 'status' => 'active', 'role_id' => $role->id]);
        $rlh = User::create(['email' => 'rlh-retribusi@test.com', 'password' => 'password', 'full_name' => 'RLH Approver', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'rlh', 'status' => 'active', 'role_id' => $role->id]);
        $rfah = User::create(['email' => 'rfah-retribusi@test.com', 'password' => 'password', 'full_name' => 'RFAH Approver', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'rfah', 'status' => 'active', 'role_id' => $role->id]);
        $role->users()->attach([$blc->id, $bac->id, $rlh->id, $rfah->id]);

        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'BAC', 'user_id' => $bac->id]);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'RLH', 'user_id' => $rlh->id]);
        ApprovalAssignment::create(['kode_depo' => 'DPT-A', 'approval_level' => 'RFAH', 'user_id' => $rfah->id]);

        return ['operator' => $blc, 'supervisor' => $bac] + compact('rlh', 'rfah');
    }

    private function createRecipients(): void
    {
        $rows = [
            ['submitted', 'TO', 'submitted@example.com'],
            ['checked', 'TO', 'checked@example.com'],
            ['rlh_approved', 'TO', 'rlh_approved@example.com'],
            ['approved', 'CC', 'approved@example.com'],
            ['rejected', 'TO', 'rejected@example.com'],
            ['revisi', 'TO', 'revisi@example.com'],
        ];
        foreach ($rows as [$trigger, $field, $email]) {
            EmailRecipient::create([
                'document_type' => 'biaya_retribusi',
                'trigger' => $trigger,
                'recipient_type' => 'email',
                'field' => $field,
                'email' => $email,
                'is_active' => true,
            ]);
        }
    }

    public function test_biaya_retribusi_approval_flow_sends_emails_for_all_triggers(): void
    {
        Mail::fake();
        $users = $this->createApprovalUsers();
        $this->createRecipients();

        $biayaRetribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-18',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 1500000,
            'is_rfah_required' => true,
            'created_by' => $users['operator']->id,
        ]);

        // BLC submit → submitted
        Sanctum::actingAs($users['operator']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/submit")->assertOk();
        Mail::assertSent(BiayaApprovalNotification::class, fn ($mail) => $mail->hasTo('submitted@example.com'));

        // BAC check → checked
        Sanctum::actingAs($users['supervisor']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/check")->assertOk();
        Mail::assertSent(BiayaApprovalNotification::class, fn ($mail) => $mail->hasTo('checked@example.com'));

        // RLH approve → rlh_approved
        Sanctum::actingAs($users['rlh']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/approve")->assertOk();
        Mail::assertSent(BiayaApprovalNotification::class, function ($mail) {
            return $mail->hasTo('rlh_approved@example.com')
                && $mail->trigger === 'rlh_approved';
        });
        $this->assertDatabaseHas('biaya_retribusis', ['id' => $biayaRetribusi->id, 'status' => 'rlh_approved']);

        // RFAH approve → approved + email approved
        Sanctum::actingAs($users['rfah']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/rfah-approve")->assertOk();
        Mail::assertSent(BiayaApprovalNotification::class, function ($mail) {
            return $mail->hasCc('approved@example.com')
                && $mail->trigger === 'approved';
        });
        $this->assertDatabaseHas('biaya_retribusis', ['id' => $biayaRetribusi->id, 'status' => 'approved']);
    }

    public function test_biaya_retribusi_rejection_sends_email(): void
    {
        Mail::fake();
        $users = $this->createApprovalUsers();
        $this->createRecipients();

        $biayaRetribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-18',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'created_by' => $users['operator']->id,
        ]);

        Sanctum::actingAs($users['operator']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/submit")->assertOk();
        Sanctum::actingAs($users['supervisor']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/check")->assertOk();

        Sanctum::actingAs($users['rlh']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/reject", ['reason' => 'Dokumen tidak lengkap'])->assertOk();

        Mail::assertSent(BiayaApprovalNotification::class, function ($mail) {
            return $mail->hasTo('rejected@example.com')
                && $mail->trigger === 'rejected'
                && $mail->actorName() === 'RLH Approver'
                && $mail->biaya->rejection_reason === 'Dokumen tidak lengkap';
        });
        $this->assertDatabaseHas('biaya_retribusis', ['id' => $biayaRetribusi->id, 'status' => 'rejected', 'rejection_reason' => 'Dokumen tidak lengkap']);
    }

    public function test_biaya_retribusi_revision_flow(): void
    {
        Mail::fake();
        $users = $this->createApprovalUsers();
        $this->createRecipients();

        $biayaRetribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-18',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'created_by' => $users['operator']->id,
        ]);

        Sanctum::actingAs($users['operator']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/submit")->assertOk();
        Sanctum::actingAs($users['supervisor']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/check")->assertOk();

        Sanctum::actingAs($users['rlh']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/revise", ['reason' => 'Foto detail belum terupload'])->assertOk();

        Mail::assertSent(BiayaApprovalNotification::class, function ($mail) {
            return $mail->hasTo('revisi@example.com')
                && $mail->trigger === 'revisi';
        });
        $this->assertDatabaseHas('biaya_retribusis', ['id' => $biayaRetribusi->id, 'status' => 'revisi', 'revisi_reason' => 'Foto detail belum terupload']);

        Sanctum::actingAs($users['operator']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/submit")->assertOk();
        $this->assertDatabaseHas('biaya_retribusis', ['id' => $biayaRetribusi->id, 'status' => 'pending', 'revisi_reason' => null]);
    }

    public function test_biaya_retribusi_without_rfah_requirement(): void
    {
        Mail::fake();
        $users = $this->createApprovalUsers();
        $this->createRecipients();

        $biayaRetribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-18',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 500000, // < Rp 1.000.000, no RFH required
            'is_rfah_required' => false,
            'created_by' => $users['operator']->id,
        ]);

        Sanctum::actingAs($users['operator']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/submit")->assertOk();
        Sanctum::actingAs($users['supervisor']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/check")->assertOk();

        Sanctum::actingAs($users['rlh']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/approve")->assertOk();

        $this->assertDatabaseHas('biaya_retribusis', ['id' => $biayaRetribusi->id, 'status' => 'approved']);
    }

    public function test_bac_can_reject_pending_document(): void
    {
        Mail::fake();
        $users = $this->createApprovalUsers();
        $this->createRecipients();

        $biayaRetribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-18',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'created_by' => $users['operator']->id,
        ]);

        Sanctum::actingAs($users['operator']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/submit")->assertOk();

        // BAC can reject while status is pending
        Sanctum::actingAs($users['supervisor']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/reject", ['reason' => 'Data tidak lengkap'])->assertOk();
        $this->assertDatabaseHas('biaya_retribusis', ['id' => $biayaRetribusi->id, 'status' => 'rejected']);
    }

    public function test_rlh_cannot_reject_pending_document(): void
    {
        Mail::fake();
        $users = $this->createApprovalUsers();
        $this->createRecipients();

        $biayaRetribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-18',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'created_by' => $users['operator']->id,
        ]);

        Sanctum::actingAs($users['operator']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/submit")->assertOk();

        // RLH cannot reject while status is pending (only BAC can)
        Sanctum::actingAs($users['rlh']);
        $this->postJson("/api/v1/biaya-retribusi/{$biayaRetribusi->id}/reject", ['reason' => 'Data tidak lengkap'])->assertForbidden();
    }
}
