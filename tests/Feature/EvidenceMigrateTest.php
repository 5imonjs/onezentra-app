<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class EvidenceMigrateTest extends TestCase
{
    use RefreshDatabase;

    public function test_dry_run_tidak_memindahkan_file(): void
    {
        Storage::fake('public');
        Storage::fake('public_legacy');
        Storage::disk('public_legacy')->put('validation-photos/lama.jpg', 'foto');

        $this->artisan('evidence:migrate')->assertSuccessful();

        Storage::disk('public_legacy')->assertExists('validation-photos/lama.jpg');
        Storage::disk('public')->assertMissing('validation-photos/lama.jpg');
    }

    public function test_apply_memindahkan_file_ke_disk_privat(): void
    {
        Storage::fake('public');
        Storage::fake('public_legacy');
        Storage::disk('public_legacy')->put('validation-photos/lama.jpg', 'foto');

        $this->artisan('evidence:migrate', [
            '--apply' => true,
            '--confirm' => 'MIGRATE EVIDENCE',
        ])->assertSuccessful();

        Storage::disk('public')->assertExists('validation-photos/lama.jpg');
        Storage::disk('public_legacy')->assertMissing('validation-photos/lama.jpg');
    }

    public function test_apply_menolak_konfirmasi_salah(): void
    {
        Storage::fake('public');
        Storage::fake('public_legacy');

        $this->artisan('evidence:migrate', [
            '--apply' => true,
            '--confirm' => 'salah',
        ])->assertFailed();
    }
}
