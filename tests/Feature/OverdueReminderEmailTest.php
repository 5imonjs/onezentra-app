<?php

namespace Tests\Feature;

use App\Mail\ProcessReminderNotification;
use App\Models\EmailNotificationLog;
use App\Models\EmailRecipient;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\SjValidation;
use App\Models\User;
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
}
