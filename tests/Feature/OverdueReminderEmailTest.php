<?php

namespace Tests\Feature;

use App\Mail\EtaOverdueNotification;
use App\Mail\ProcessReminderNotification;
use App\Models\EmailNotificationLog;
use App\Models\EmailRecipient;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\SjValidation;
use App\Models\User;
use App\Services\Reminder\OverdueProcessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class OverdueReminderEmailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();

        $role = Role::firstOrCreate(['slug' => 'blc'], ['name' => 'BLC']);
        $blc = User::create([
            'email' => 'blc@reminder.test',
            'password' => 'password',
            'full_name' => 'BLC Reminder',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'blc',
            'status' => 'active',
        ]);
        $role->users()->attach($blc->id);

        EmailRecipient::create([
            'document_type' => 'sj_ba',
            'trigger' => 'reminder',
            'kode_depo' => null,
            'field' => 'TO',
            'recipient_type' => 'role',
            'role_slug' => 'blc',
            'label' => 'BLC pengingat validasi',
            'is_active' => true,
        ]);
    }

    private function rencana(): RencanaKirim
    {
        return RencanaKirim::create([
            'po_transporter' => 'PO-REM-1',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'status' => 'SCHEDULED',
        ]);
    }

    public function test_command_mengirim_reminder_ke_penerima_terkonfigurasi(): void
    {
        $rencana = $this->rencana();
        $validation = SjValidation::create([
            'rencana_kirim_id' => $rencana->id,
            'status' => 'IN_PROGRESS',
            'started_at' => now()->subMinutes(45),
        ]);

        $this->artisan('reminders:send-overdue')->assertSuccessful();

        Mail::assertSent(ProcessReminderNotification::class, function (ProcessReminderNotification $mail) {
            return $mail->hasTo('blc@reminder.test')
                && str_contains($mail->envelope()->subject, 'Validasi SJ belum selesai');
        });
        $this->assertDatabaseHas('email_notification_logs', [
            'document_type' => 'sj_ba',
            'trigger' => 'reminder',
            'context_id' => $validation->id,
            'status' => EmailNotificationLog::STATUS_SENT,
        ]);
    }

    public function test_command_tidak_mengirim_ulang_dalam_jendela_dua_jam(): void
    {
        $rencana = $this->rencana();
        $validation = SjValidation::create([
            'rencana_kirim_id' => $rencana->id,
            'status' => 'IN_PROGRESS',
            'started_at' => now()->subMinutes(45),
        ]);
        EmailNotificationLog::create([
            'document_type' => 'sj_ba',
            'trigger' => 'reminder',
            'context_id' => $validation->id,
            'status' => EmailNotificationLog::STATUS_SENT,
            'created_at' => now()->subMinutes(30),
        ]);

        $this->artisan('reminders:send-overdue')->assertSuccessful();

        Mail::assertNothingSent();
        $this->assertSame(1, EmailNotificationLog::where('document_type', 'sj_ba')
            ->where('trigger', 'reminder')
            ->where('context_id', $validation->id)
            ->count());
    }

    public function test_proses_yang_belum_lewat_ambang_tidak_mendapat_email(): void
    {
        $rencana = $this->rencana();
        SjValidation::create([
            'rencana_kirim_id' => $rencana->id,
            'status' => 'IN_PROGRESS',
            'started_at' => now()->subMinutes(5),
        ]);

        $this->artisan('reminders:send-overdue')->assertSuccessful();

        Mail::assertNothingSent();
    }

    public function test_eta_terlewat_belum_checkin_terdetect_dan_mengirim_email(): void
    {
        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-ETA-OVERDUE', 'status' => 'DRAFT',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'created_by' => 1,
            'rkh_date' => now()->subDays(4)->toDateString(),
            'eta_date' => now()->subDays(2)->toDateString(),
        ]);
        EmailRecipient::create([
            'document_type' => 'rencana_kirim', 'trigger' => 'eta_overdue',
            'kode_depo' => null, 'field' => 'TO', 'recipient_type' => 'role',
            'role_slug' => 'blc', 'label' => 'BLC ETA', 'is_active' => true,
        ]);

        $service = app(OverdueProcessService::class);
        $this->assertTrue($service->etaOverdueRencana()->contains('id', $rencana->id));

        $this->artisan('reminders:send-eta-overdue')->assertSuccessful();

        Mail::assertSent(EtaOverdueNotification::class, function (EtaOverdueNotification $mail) {
            return $mail->hasTo('blc@reminder.test')
                && str_contains($mail->envelope()->subject, 'Rencana tiba terlewat');
        });
        $this->assertDatabaseHas('email_notification_logs', [
            'document_type' => 'rencana_kirim',
            'trigger' => 'eta_overdue',
            'context_id' => $rencana->id,
            'status' => EmailNotificationLog::STATUS_SENT,
        ]);
    }

    public function test_eta_terlewat_tidak_mengirim_ulang_dalam_dua_jam(): void
    {
        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-ETA-COOLDOWN', 'status' => 'DRAFT',
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'created_by' => 1,
            'rkh_date' => now()->subDays(4)->toDateString(),
            'eta_date' => now()->subDay()->toDateString(),
        ]);
        EmailRecipient::create([
            'document_type' => 'rencana_kirim', 'trigger' => 'eta_overdue',
            'kode_depo' => null, 'field' => 'TO', 'recipient_type' => 'role',
            'role_slug' => 'blc', 'label' => 'BLC ETA', 'is_active' => true,
        ]);
        EmailNotificationLog::create([
            'document_type' => 'rencana_kirim', 'trigger' => 'eta_overdue',
            'context_id' => $rencana->id, 'status' => EmailNotificationLog::STATUS_SENT,
            'created_at' => now()->subMinutes(30),
        ]);

        $this->artisan('reminders:send-eta-overdue')->assertSuccessful();

        Mail::assertNothingSent();
    }
}
