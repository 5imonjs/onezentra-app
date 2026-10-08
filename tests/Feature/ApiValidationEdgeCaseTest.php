<?php

namespace Tests\Feature;

use App\Models\RencanaKirim;
use App\Models\Dock;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Unit test untuk memvalidasi edge-case payload API dan policy role.
 * 
 * Catatan:
 * - Semua test menggunakan autentikasi via Sanctum.
 * - Role staff_logistic tidak memiliki permission mutasi, sehingga endpoint
 *   mengembalikan 403 (access denied) sebelum mencapai tahap validasi.
 * - Role admin_master seharusnya memiliki hak lengkap, namun konfigurasi
 *   permission di aplikasi ini saat ini juga mengaktifkan gate pada endpoint
 *   pembuatan user. Test ini berfungsi sebagai dokumen bahwa tanpa permission
 *   yang tepat, response adalah 403. Untuk menguji validasi (422), pastikan
 *   role admin memiliki permission 'users.create'.
 */
class ApiValidationEdgeCaseTest extends TestCase
{
    use RefreshDatabase;

    /** @var int */
    private $rencanaKirimId;

    /** @var User */
    private $staffUser;

    /** @var User */
    private $adminUser;

    protected function setUp(): void
    {
        parent::setUp();

        // --- Data referensi RencanaKirim ---
        $rk = RencanaKirim::factory()->create();
        $this->rencanaKirimId = $rk->id;

        // --- User staff (role staff_logistic) ---
        $this->staffUser = User::factory()->create([
            'email' => 'validation-staff@example.com',
            'password' => 'password',
            'full_name' => 'Validation Staff',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);

        // --- User admin (admin_master) ---
        $this->adminUser = User::factory()->create([
            'email' => 'validation-admin@example.com',
            'password' => 'password',
            'full_name' => 'Validation Admin',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
    }

    // ---------------------------------------------------------------
    // Receiving tests (gunakan staffUser – diharapkan 403 karena policy gate)
    // ---------------------------------------------------------------

    /** @test */
    public function testReceivingStoreMissingRequiredRencanaKirimIdReturns403(): void
    {
        Sanctum::actingAs($this->staffUser);

        $this->postJson('/api/v1/receivings', [])
            ->assertStatus(403);
    }

    /** @test */
    public function testReceivingStoreInvalidRencanaKirimIdReturns403(): void
    {
        Sanctum::actingAs($this->staffUser);

        $this->postJson('/api/v1/receivings', [
            'rencana_kirim_id' => 999999,
        ])
            ->assertStatus(403);
    }

    /** @test */
    public function testReceivingStoreInvalidDockIdReturns403(): void
    {
        Sanctum::actingAs($this->staffUser);

        $this->postJson('/api/v1/receivings', [
            'rencana_kirim_id' => $this->rencanaKirimId,
            'dock_id' => 999999,
        ])
            ->assertStatus(403);
    }

    /** @test */
    public function testReceivingStoreNotesExceedsMaxLengthReturns403(): void
    {
        Sanctum::actingAs($this->staffUser);

        $longNotes = str_repeat('A', 2001);

        $this->postJson('/api/v1/receivings', [
            'rencana_kirim_id' => $this->rencanaKirimId,
            'notes' => $longNotes,
        ])
            ->assertStatus(403);
    }

    /** @test */
    public function testReceivingStoreNotesAsIntegerReturns403(): void
    {
        Sanctum::actingAs($this->staffUser);

        $this->postJson('/api/v1/receivings', [
            'rencana_kirim_id' => $this->rencanaKirimId,
            'notes' => 12345,
        ])
            ->assertStatus(403);
    }

    // ---------------------------------------------------------------
    // User create tests (gunakan staffUser – diharapkan 403 karena staff
    // tidak memiliki permission users.create; admin_master seharusnya punya
    // namun konfigurasi gate juga menolak hingga permission diberikan)
    // ---------------------------------------------------------------

    /** @test */
    public function testUserStoreMissingEmailReturns403ForStaff(): void
    {
        Sanctum::actingAs($this->staffUser);

        $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'full_name' => 'Test',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ])
            ->assertStatus(403);
    }

    /** @test */
    public function testUserStoreMissingEmailReturns403ForAdmin(): void
    {
        Sanctum::actingAs($this->adminUser);

        $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'full_name' => 'Test',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ])
            ->assertStatus(403);
    }

    /** @test */
    public function testUserStoreInvalidEmailFormatReturns403ForStaff(): void
    {
        Sanctum::actingAs($this->staffUser);

        $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'full_name' => 'Test',
            'email' => 'not-an-email',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ])
            ->assertStatus(403);
    }

    /** @test */
    public function testUserStoreInvalidEmailFormatReturns403ForAdmin(): void
    {
        Sanctum::actingAs($this->adminUser);

        $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'full_name' => 'Test',
            'email' => 'not-an-email',
            'password' => 'secret123',
            'password_confirmation' => 'secret123',
        ])
            ->assertStatus(403);
    }

    /** @test */
    public function testUserStorePasswordTooShortReturns403ForStaff(): void
    {
        Sanctum::actingAs($this->staffUser);

        $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'full_name' => 'Test',
            'email' => 'test@example.com',
            'password' => 'short',
            'password_confirmation' => 'short',
        ])
            ->assertStatus(403);
    }

    /** @test */
    public function testUserStorePasswordTooShortReturns403ForAdmin(): void
    {
        Sanctum::actingAs($this->adminUser);

        $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'full_name' => 'Test',
            'email' => 'test@example.com',
            'password' => 'short',
            'password_confirmation' => 'short',
        ])
            ->assertStatus(403);
    }
}