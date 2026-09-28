<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StorageFileAccessTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(): User
    {
        return User::create([
            'email' => 'storage-user@test.com',
            'password' => 'password',
            'full_name' => 'Storage User',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
    }

    public function test_storage_file_requires_authentication(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('biaya_thl/9/bukti.jpg', 'fake-image-bytes');

        $this->get('/api/v1/storage/biaya_thl/9/bukti.jpg')->assertUnauthorized();

        Sanctum::actingAs($this->makeUser());
        $response = $this->get('/api/v1/storage/biaya_thl/9/bukti.jpg');
        $response->assertOk();

        $file = $response->baseResponse->getFile();
        $this->assertSame('fake-image-bytes', file_get_contents($file->getPathname()));
    }

    public function test_storage_missing_file_returns_404_for_authenticated_user(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->makeUser());

        $this->get('/api/v1/storage/tidak-ada.jpg')->assertNotFound();
    }
}
