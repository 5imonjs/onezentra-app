<?php

namespace Tests\Feature;

use App\Mail\RencanaKirimCancelled;
use App\Mail\RencanaKirimCreated;
use App\Models\EmailRecipient;
use App\Models\Npn;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RencanaKirimEmailTest extends TestCase
{
    use RefreshDatabase;

    private function planner(): User
    {
        $role = Role::firstOrCreate(['slug' => 'rk_email_flow'], ['name' => 'RK Email Flow']);
        foreach (['rencana_kirim.create', 'rencana_kirim.edit', 'rencana_kirim.import', 'depot.view_all'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'rk-email-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'RK Email Planner',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function createRecipients(string $trigger): void
    {
        EmailRecipient::create([
            'document_type' => 'rencana_kirim',
            'trigger' => $trigger,
            'recipient_type' => 'email',
            'field' => 'TO',
            'email' => 'rk-to@example.com',
            'is_active' => true,
        ]);
        EmailRecipient::create([
            'document_type' => 'rencana_kirim',
            'trigger' => $trigger,
            'recipient_type' => 'email',
            'field' => 'CC',
            'email' => 'rk-cc@example.com',
            'is_active' => true,
        ]);
    }

    private function createDraftRk(User $user): RencanaKirim
    {
        return RencanaKirim::create([
            'po_transporter' => 'PO-EMAIL-'.uniqid(),
            'status' => 'DRAFT',
            'rkh_date' => now()->toDateString(),
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'total_qty' => 10,
            'created_by' => $user->id,
        ]);
    }

    public function test_create_sends_created_email_once_even_after_scheduling(): void
    {
        Mail::fake();
        $user = $this->planner();
        $this->createRecipients('created');

        Sanctum::actingAs($user);
        $response = $this->postJson('/api/v1/rencana-kirim', [
            'po_transporter' => 'PO-EMAIL-'.uniqid(),
        ])->assertCreated();
        $rencanaKirimId = $response->json('data.id');

        Mail::assertSentCount(1);
        Mail::assertSent(RencanaKirimCreated::class, fn ($mail) => $mail->hasTo('rk-to@example.com'));
        Mail::assertSent(RencanaKirimCreated::class, fn ($mail) => $mail->hasCc('rk-cc@example.com'));
        $this->assertDatabaseHas('email_notification_logs', [
            'document_type' => 'rencana_kirim',
            'trigger' => 'created',
            'context_id' => $rencanaKirimId,
            'status' => 'sent',
        ]);

        $this->postJson("/api/v1/rencana-kirim/{$rencanaKirimId}/schedule")->assertOk();

        Mail::assertSentCount(1);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rencanaKirimId, 'status' => 'SCHEDULED']);
    }

    public function test_imported_rencana_kirim_sends_created_email_after_import_commit(): void
    {
        Mail::fake();
        $user = $this->planner();
        $this->createRecipients('created');
        $npn = Npn::create([
            'BOSnetszProductId' => 'RK-EMAIL-ITEM',
            'szNickName' => 'Produk Email',
            'SAPszProductId' => 'SAP-RK-EMAIL',
            'szStatus' => 'EXISTING',
        ]);

        Sanctum::actingAs($user);
        $this->post('/api/v1/rencana-kirim/import', [
            'file' => UploadedFile::fake()->createWithContent(
                'rencana.csv',
                "po_transporter,kode_depo,kode_barang,nama_barang,jumlah,satuan\nPO-IMPORT-EMAIL,DPO,{$npn->BOSnetszProductId},Produk Email,2,CRT\n"
            ),
        ])->assertOk()->assertJsonPath('data.imported', 1);

        Mail::assertSentCount(1);
        Mail::assertSent(RencanaKirimCreated::class, fn ($mail) => $mail->hasTo('rk-to@example.com'));
        $this->assertDatabaseHas('email_notification_logs', [
            'document_type' => 'rencana_kirim',
            'trigger' => 'created',
            'status' => 'sent',
        ]);
    }

    public function test_schedule_does_not_send_created_email_for_existing_draft(): void
    {
        Mail::fake();
        $user = $this->planner();
        $this->createRecipients('created');
        $rk = $this->createDraftRk($user);

        Sanctum::actingAs($user);
        $this->postJson("/api/v1/rencana-kirim/{$rk->id}/schedule")->assertOk();

        Mail::assertNotSent(RencanaKirimCreated::class);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'SCHEDULED']);
    }

    public function test_cancel_sends_cancelled_email(): void
    {
        Mail::fake();
        $user = $this->planner();
        $this->createRecipients('cancelled');
        $rk = $this->createDraftRk($user);

        Sanctum::actingAs($user);
        $this->postJson("/api/v1/rencana-kirim/{$rk->id}/cancel")->assertOk();

        Mail::assertSent(RencanaKirimCancelled::class, fn ($mail) => $mail->hasTo('rk-to@example.com'));
        Mail::assertSent(RencanaKirimCancelled::class, fn ($mail) => $mail->hasCc('rk-cc@example.com'));
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'CANCELLED']);
    }

    public function test_cancel_without_recipients_still_cancels_silently(): void
    {
        Mail::fake();
        $user = $this->planner();
        $rk = $this->createDraftRk($user);

        Sanctum::actingAs($user);
        $this->postJson("/api/v1/rencana-kirim/{$rk->id}/cancel")->assertOk();

        Mail::assertNotSent(RencanaKirimCancelled::class);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'CANCELLED']);
    }

    public function test_cancel_still_succeeds_and_logs_when_smtp_is_down(): void
    {
        // SMTP menunjuk ke port mati → Mail::send lempar, service wajib menelan + log.
        config(['mail.default' => 'smtp']);
        config(['mail.mailers.smtp.host' => '127.0.0.1']);
        config(['mail.mailers.smtp.port' => 1]);
        Log::spy();

        $user = $this->planner();
        $this->createRecipients('cancelled');
        $rk = $this->createDraftRk($user);

        Sanctum::actingAs($user);
        $this->postJson("/api/v1/rencana-kirim/{$rk->id}/cancel")->assertOk();

        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'CANCELLED']);
        Log::shouldHaveReceived('error')->once();
    }
}
