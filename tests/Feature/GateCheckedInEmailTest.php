<?php

namespace Tests\Feature;

use App\Mail\GateCheckedIn;
use App\Models\EmailRecipient;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GateCheckedInEmailTest extends TestCase
{
    use RefreshDatabase;

    public function test_check_in_sends_checked_in_email(): void
    {
        Mail::fake();

        $role = Role::firstOrCreate(['slug' => 'gate_email_flow'], ['name' => 'Gate Email Flow']);
        foreach (['gate.create', 'depot.view_all'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'gate-email-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Gate Email User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        EmailRecipient::create([
            'document_type' => 'gate',
            'trigger' => 'checked_in',
            'recipient_type' => 'email',
            'field' => 'TO',
            'email' => 'gate-to@example.com',
            'is_active' => true,
        ]);
        EmailRecipient::create([
            'document_type' => 'gate',
            'trigger' => 'checked_in',
            'recipient_type' => 'email',
            'field' => 'CC',
            'email' => 'gate-cc@example.com',
            'is_active' => true,
        ]);

        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-GATE-EMAIL-'.uniqid(),
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'status' => 'SCHEDULED',
            'created_by' => $user->id,
        ]);

        Sanctum::actingAs($user);
        $response = $this->postJson('/api/v1/gate-transactions', [
            'rencana_kirim_id' => $rk->id,
            'gate_type' => 'INBOUND',
        ])->assertCreated();

        Mail::assertSent(GateCheckedIn::class, fn ($mail) => $mail->hasTo('gate-to@example.com'));
        Mail::assertSent(GateCheckedIn::class, fn ($mail) => $mail->hasCc('gate-cc@example.com'));
        $this->assertDatabaseHas('email_notification_logs', [
            'document_type' => 'gate',
            'trigger' => 'checked_in',
            'context_id' => $response->json('data.id'),
            'status' => 'sent',
        ]);
        $this->assertDatabaseHas('rencana_kirim', ['id' => $rk->id, 'status' => 'CHECKED_IN']);
    }
}
