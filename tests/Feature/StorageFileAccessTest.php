<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;
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

    /**
     * Sanctum hanya mengaktifkan middleware session bila request dianggap
     * "dari frontend SPA", yang ditentukan dari header Referer/Origin
     * (EnsureFrontendRequestsAreStateful::fromFrontend). Link `<a>` yang
     * memakai rel="noreferrer" membuat browser MENGHAPUS Referer, sehingga
     * cookie sesi tidak terbaca dan endpoint storage membalas 401 walaupun
     * user sudah login.
     *
     * Guard ini mengunci kontraknya. Catatan: tidak bisa diuji lewat status
     * HTTP karena `Sanctum::actingAs()` menyet authenticator secara langsung,
     * sehingga middleware stateful dilewati di test. Yang diuji di sini adalah
     * keputusan "apakah request ini dianggap dari frontend" — faktor penentu
     * apakah cookie sesi dibaca pada request sebenarnya dari browser.
     *
     * Lihat onezentra-web/src/lib/storageFile.ts (AUTHENTICATED_FILE_REL).
     */
    public function test_sanctum_considers_referer_header_when_deciding_stateful_request(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('validation-photos/x.jpg', 'fake-image-bytes');

        // Navigasi dari SPA: Referer ada -> dianggap stateful -> cookie dibaca.
        $spaNavigation = Request::create(
            '/api/v1/storage/validation-photos/x.jpg',
            'GET',
            server: ['HTTP_REFERER' => 'http://localhost:3000/validasi-sj'],
        );
        $this->assertTrue(EnsureFrontendRequestsAreStateful::fromFrontend($spaNavigation));

        // Efek rel="noreferrer": browser menghapus Referer, dan navigasi
        // GET tidak mengirim Origin -> request jadi stateless, cookie sesi
        // tidak dibaca -> 401 pada file yang padahal ada.
        $strippedNavigation = Request::create('/api/v1/storage/validation-photos/x.jpg', 'GET');
        $this->assertFalse(EnsureFrontendRequestsAreStateful::fromFrontend($strippedNavigation));
    }
}
