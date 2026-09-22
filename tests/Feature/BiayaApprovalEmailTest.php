<?php

namespace Tests\Feature;

use App\Mail\BiayaApprovalNotification;
use App\Models\ApprovalAssignment;
use App\Models\BiayaThl;
use App\Models\BiayaThlDetail;
use App\Models\BiayaThlPhoto;
use App\Models\EmailRecipient;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiayaApprovalEmailTest extends TestCase
{
    use RefreshDatabase;

    private function createApprovalUsers(): array
    {
        $role = Role::firstOrCreate(['slug' => 'workflow_email'], ['name' => 'Workflow Email']);
        $perms = ['approval.submit', 'approval.check', 'approval.approve', 'approval.rfah', 'approval.reject', 'approval.revise', 'emails.view', 'emails.edit'];
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $blc = User::create(['email' => 'blc-email@test.com', 'password' => 'password', 'full_name' => 'BLC Sender', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'staff_logistic', 'status' => 'active', 'role_id' => $role->id]);
        $bac = User::create(['email' => 'bac-email@test.com', 'password' => 'password', 'full_name' => 'BAC Checker', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'bac', 'status' => 'active', 'role_id' => $role->id]);
        $rlh = User::create(['email' => 'rlh-email@test.com', 'password' => 'password', 'full_name' => 'RLH Approver', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'rlh', 'status' => 'active', 'role_id' => $role->id]);
        $rfah = User::create(['email' => 'rfah-email@test.com', 'password' => 'password', 'full_name' => 'RFAH Approver', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'level' => 'rfah', 'status' => 'active', 'role_id' => $role->id]);
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
                'document_type' => 'biaya_thl',
                'trigger' => $trigger,
                'recipient_type' => 'email',
                'field' => $field,
                'email' => $email,
                'is_active' => true,
            ]);
        }
    }

    public function test_biaya_thl_approval_flow_sends_emails_for_all_triggers(): void
    {
        Mail::fake();
        $users = $this->createApprovalUsers();
        $this->createRecipients();

        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-18',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 1500000,
            'is_rfah_required' => true,
            'created_by' => $users['operator']->id,
        ]);
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

        // BLC submit → submitted
        Sanctum::actingAs($users['operator']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/submit")->assertOk();
        Mail::assertSent(BiayaApprovalNotification::class, fn ($mail) => $mail->hasTo('submitted@example.com'));

        // BAC check → checked
        Sanctum::actingAs($users['supervisor']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/check")->assertOk();
        Mail::assertSent(BiayaApprovalNotification::class, fn ($mail) => $mail->hasTo('checked@example.com'));

        // RLH approve → rlh_approved + email rlh_approved (karena is_rfah_required = true)
        Sanctum::actingAs($users['rlh']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/approve")->assertOk();
        Mail::assertSent(BiayaApprovalNotification::class, function ($mail) {
            return $mail->hasTo('rlh_approved@example.com')
                && $mail->trigger === 'rlh_approved'
                && $mail->subjectLabel() === 'Disetujui RLH'
                && $mail->actorName() === 'RLH Approver'
                && $mail->actorTime() !== null;
        });

        $this->assertDatabaseHas('biaya_thls', ['id' => $biaya->id, 'status' => 'rlh_approved']);

        // RFAH revise → BLC resubmits to RFAH, not BAC.
        Sanctum::actingAs($users['rfah']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/revise", ['reason' => 'Mohon perjelas bukti foto'])->assertOk();
        $this->assertDatabaseHas('biaya_thls', [
            'id' => $biaya->id,
            'status' => 'revisi',
            'revision_return_status' => 'rlh_approved',
        ]);

        Sanctum::actingAs($users['operator']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/submit")->assertOk();
        $this->assertDatabaseHas('biaya_thls', [
            'id' => $biaya->id,
            'status' => 'rlh_approved',
            'resubmitted_by' => $users['operator']->id,
        ]);

        // RFAH approve → approved + email approved
        Sanctum::actingAs($users['rfah']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/rfah-approve")->assertOk();
        Mail::assertSent(BiayaApprovalNotification::class, function ($mail) {
            return $mail->hasCc('approved@example.com')
                && $mail->trigger === 'approved'
                && str_contains($mail->subjectLabel(), 'Disetujui');
        });

        $this->assertDatabaseHas('biaya_thls', ['id' => $biaya->id, 'status' => 'approved']);
    }

    public function test_biaya_thl_rejection_sends_email_with_actor_and_reason(): void
    {
        Mail::fake();
        $users = $this->createApprovalUsers();
        $this->createRecipients();

        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-18',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'created_by' => $users['operator']->id,
        ]);
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

        Sanctum::actingAs($users['operator']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/submit")->assertOk();

        Sanctum::actingAs($users['supervisor']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/check")->assertOk();

        Sanctum::actingAs($users['rlh']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/reject", ['reason' => 'Dokumen tidak lengkap'])->assertOk();

        Mail::assertSent(BiayaApprovalNotification::class, function ($mail) {
            return $mail->hasTo('rejected@example.com')
                && $mail->trigger === 'rejected'
                && $mail->actorName() === 'RLH Approver'
                && $mail->biaya->rejection_reason === 'Dokumen tidak lengkap';
        });

        $this->assertDatabaseHas('biaya_thls', ['id' => $biaya->id, 'status' => 'rejected', 'rejection_reason' => 'Dokumen tidak lengkap']);
    }

    public function test_biaya_thl_revision_sends_email_with_catatan_and_resubmit_completes(): void
    {
        Mail::fake();
        $users = $this->createApprovalUsers();
        $this->createRecipients();

        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-18',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'created_by' => $users['operator']->id,
        ]);
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

        Sanctum::actingAs($users['operator']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/submit")->assertOk();

        Sanctum::actingAs($users['supervisor']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/check")->assertOk();

        // RLH sends back for revision with mandatory catatan
        Sanctum::actingAs($users['rlh']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/revise", ['reason' => 'Foto detail belum terupload'])->assertOk();

        Mail::assertSent(BiayaApprovalNotification::class, function ($mail) {
            return $mail->hasTo('revisi@example.com')
                && $mail->trigger === 'revisi'
                && $mail->subjectLabel() === 'Perlu Revisi'
                && $mail->actorName() === 'RLH Approver'
                && $mail->biaya->revisi_reason === 'Foto detail belum terupload';
        });

        $this->assertDatabaseHas('biaya_thls', ['id' => $biaya->id, 'status' => 'revisi', 'revisi_reason' => 'Foto detail belum terupload']);

        // Submitter fixes and resubmits → revision fields cleared
        Sanctum::actingAs($users['operator']);
        $this->postJson("/api/v1/biaya-thl/{$biaya->id}/submit")->assertOk();

        $this->assertDatabaseHas('biaya_thls', [
            'id' => $biaya->id,
            'status' => 'checked',
            'revisi_reason' => 'Foto detail belum terupload',
            'resubmitted_by' => $users['operator']->id,
        ]);
    }
}
