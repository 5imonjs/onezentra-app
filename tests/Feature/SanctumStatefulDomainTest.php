<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;
use Tests\TestCase;

/**
 * Regression test untuk BUG-3.
 *
 * Gejalanya sangat menyesatkan: login membalas 200 "Login successful", cookie
 * sesi bahkan terbit dan terecommit ke tabel `sessions` — tapi setiap request
 * berikutnya membalas 401. Penyebabnya `sanctum.stateful` tidak mencocokkan
 * origin ber-port, sehingga middleware tidak pernah attaches StartSession.
 *
 * Test di sini mengunci invariannya agar config tidak bisa diam-diam kembali
 * rusak saat ada yang menyunting `sanctum.php` atau `cors.php`.
 */
class SanctumStatefulDomainTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Sanitizeunning, non-stateful: Origin/Referer tidak boleh membuat domain
     * trusted secara diam-diam.
     */
    public function test_foreign_origin_is_not_stateful(): void
    {
        $this->assertFalse($this->fromFrontend('https://evil.example.com/'), 'origin asing tidak boleh dianggap stateful');
        $this->assertFalse($this->fromFrontend('https://localhost.evil.com/'));
    }

    /**
     * INI inti bug-nya: entri tanpa port ("localhost") tidak menutupi origin
     * ber-port ("localhost:3000"). Kalau daftar hanya memuat host polos,
     * frontend yang berjalan di port non-default akan lolos CORS lalu ditolak
     * Sanctum.
     */
    public function test_stateful_domains_cover_every_allowed_cors_origin(): void
    {
        $corsOrigins = config('cors.allowed_origins');
        $this->assertNotEmpty($corsOrigins, 'config/cors.php tidak menghasilkan origin');

        foreach ($corsOrigins as $origin) {
            $origin = trim((string) $origin);
            if ($origin === '' || $origin === '*') {
                continue;
            }

            $this->assertTrue(
                $this->fromFrontend($origin.'/'),
                "Origin CORS {$origin} tidak terdaftar di sanctum.stateful. "
                .'Request dari origin ini akan lolos CORS lalu ditolak Sanctum '
                .'(login 200 tanpa cookie sesi, semua request berikutnya 401).'
            );
        }
    }

    /**
     * Penaga tambahan: daftar wajib memuat origin ber-port, bukan cuma host.
     * Inilah yang hilang di config lama.
     */
    public function test_stateful_domains_include_hosts_with_ports(): void
    {
        $stateful = config('sanctum.stateful');

        $withPort = array_filter($stateful, fn ($d) => str_contains((string) $d, ':'));

        $this->assertNotEmpty(
            $withPort,
            'sanctum.stateful tidak punya entri ber-port. Sanctum membentuk pola '
            .'"<entri>/*", jadi entri "localhost" TIDAK menutupi "localhost:3000".'
        );
    }

    /**
     * Request tanpa Origin (curl, health check, cron) harus tetap bisa
     * stateful supaya tooling internal tidak ikut 401.
     */
    public function test_local_requests_without_origin_remain_stateful(): void
    {
        foreach (['localhost', 'localhost:3000', '127.0.0.1', '127.0.0.1:3000'] as $host) {
            $this->assertContains($host, config('sanctum.stateful'), "host {$host} tidak terdaftar");
        }
    }

    /**
     * Bukti fungsional: request ber-Origin frontend harus benar-benar
     * terautentikasi lewat cookie sesi setelah login.
     *
     * Test config di atas hanya membuktikan daftar domain cocok; test ini
     * membuktikan middleware benar-benar menempel dan Sanctum membaca sesi.
     * Tanpa ini, konfigurasi bisa "benar" tapi middleware tetap tidak aktif.
     */
    public function test_session_auth_works_end_to_end_from_frontend_origin(): void
    {
        $user = User::factory()->create([
            'email' => 'stateful@example.com',
            'password' => 'secret-123',
        ]);

        $frontendOrigin = 'http://localhost:3000';

        $login = $this->withHeaders([
            'Origin' => $frontendOrigin,
            'Referer' => $frontendOrigin.'/',
            'Accept' => 'application/json',
        ])->postJson('/api/v1/login', [
            'email' => 'stateful@example.com',
            'password' => 'secret-123',
        ]);

        $login->assertOk();

        // Request lanjutan harus ikut terautentikasi. Kalau Sanctum tidak
        // stateful, cookie sesi tidak diterbitkan/terbaca dan hasilnya 401 —
        // persis gejala bug yang pernah terjadi.
        $me = $this->withHeaders([
            'Origin' => $frontendOrigin,
            'Referer' => $frontendOrigin.'/',
            'Accept' => 'application/json',
        ])->getJson('/api/v1/user');

        // `assertOk()` di baris ini adalah inti pembuktian: kalau Sanctum tidak
        // stateful, request ini 401 persis seperti gejala bug yang pernah terjadi.
        $me->assertOk()
            ->assertJsonPath('user.email', 'stateful@example.com')
            ->assertJsonStructure(['user' => ['id', 'email'], 'permissions']);
    }

    private function fromFrontend(string $originOrReferer): bool
    {
        $request = Request::create(
            'http://127.0.0.1:8000/api/v1/user',
            'GET',
            [],
            [],
            [],
            ['HTTP_ORIGIN' => $originOrReferer, 'HTTP_REFERER' => $originOrReferer]
        );

        return EnsureFrontendRequestsAreStateful::fromFrontend($request);
    }
}
