<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\EmailRecipientController;
use App\Models\EmailRecipient;
use Database\Seeders\EmailNotificationSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use ReflectionClass;
use Tests\TestCase;

/**
 * Default penerima email harus Global (`kode_depo = null`) dan seeder harus
 * idempoten serta tidak menyentuh baris khusus depo.
 */
class EmailNotificationSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeder_membuat_baris_global_dan_idempoten(): void
    {
        $this->seed(EmailNotificationSeeder::class);
        $count = EmailRecipient::count();

        $this->assertGreaterThan(0, $count);
        $this->assertSame(0, EmailRecipient::whereNotNull('kode_depo')->count());

        $this->seed(EmailNotificationSeeder::class);

        $this->assertSame($count, EmailRecipient::count());
    }

    public function test_seeder_mencakup_semua_trigger_dokumen(): void
    {
        $this->seed(EmailNotificationSeeder::class);

        /** @var array<string, list<string>> $triggers */
        $triggers = (new ReflectionClass(EmailRecipientController::class))
            ->getConstant('DOCUMENT_TRIGGERS');

        foreach ($triggers as $documentType => $documentTriggers) {
            foreach ($documentTriggers as $trigger) {
                $this->assertDatabaseHas('email_recipients', [
                    'document_type' => $documentType,
                    'trigger' => $trigger,
                    'kode_depo' => null,
                    'field' => 'TO',
                    'is_active' => true,
                ]);
            }
        }
    }

    public function test_seeder_tidak_menimpa_baris_khusus_depo(): void
    {
        // Kunci `updateOrCreate` kini menyertakan `kode_depo`, sehingga baris
        // khusus depo tidak dianggap pasangan untuk baris Global.
        EmailRecipient::create([
            'document_type' => 'biaya_thl',
            'trigger' => 'submitted',
            'kode_depo' => '0127',
            'recipient_type' => 'email',
            'field' => 'TO',
            'email' => 'singkawang@test.com',
            'is_active' => true,
        ]);

        $this->seed(EmailNotificationSeeder::class);

        $this->assertDatabaseHas('email_recipients', [
            'document_type' => 'biaya_thl',
            'trigger' => 'submitted',
            'kode_depo' => '0127',
            'email' => 'singkawang@test.com',
        ]);
        // Baris Global untuk pasangan yang sama dibuat terpisah.
        $this->assertDatabaseHas('email_recipients', [
            'document_type' => 'biaya_thl',
            'trigger' => 'submitted',
            'kode_depo' => null,
            'role_slug' => 'blc',
        ]);
    }
}
