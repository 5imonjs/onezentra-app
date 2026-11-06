<?php

namespace Tests\Feature;

use App\Models\AppRelease;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AppReleaseTest extends TestCase
{
    use RefreshDatabase;

    public function test_update_info_returns_null_when_no_releases(): void
    {
        $res = $this->getJson('/api/v1/app/update-info?platform=android');

        $res->assertOk()
            ->assertExactJson([
                'release' => null,
                'min_supported_code' => 0,
            ]);
    }

    public function test_update_info_returns_latest_published_release(): void
    {
        AppRelease::create([
            'platform' => 'android',
            'version_name' => '1.0.1',
            'version_code' => 2,
            'min_supported_code' => 0,
            'apk_url' => 'https://example.test/storage/releases/onezentra-2.apk',
            'sha256' => str_repeat('a', 64),
            'published_at' => now()->subDay(),
        ]);
        // Rilis baru yang lebih tinggi, namun belum dipublikasikan — diabaikan.
        AppRelease::create([
            'platform' => 'android',
            'version_name' => '1.0.2',
            'version_code' => 3,
            'min_supported_code' => 0,
            'apk_url' => 'https://example.test/storage/releases/onezentra-3.apk',
            'published_at' => now()->addDay(),
        ]);

        $res = $this->getJson('/api/v1/app/update-info?platform=android')->assertOk();

        $this->assertSame('1.0.1', $res->json('release.version_name'));
        $this->assertSame(2, $res->json('release.version_code'));
        $this->assertSame(str_repeat('a', 64), $res->json('release.sha256'));
        $this->assertFalse($res->json('release.force'));

        // min_supported dihitung dari seluruh rilis terpublikasi.
        $this->assertSame(0, $res->json('min_supported_code'));
    }

    public function test_update_info_picks_root_min_supported_and_platform(): void
    {
        AppRelease::create([
            'platform' => 'android',
            'version_name' => '1.0.1',
            'version_code' => 2,
            'min_supported_code' => 2,
            'apk_url' => 'https://example.test/a-2.apk',
            'published_at' => now()->subDay(),
        ]);
        AppRelease::create([
            'platform' => 'android',
            'version_name' => '1.0.0',
            'version_code' => 1,
            'min_supported_code' => 1,
            'apk_url' => 'https://example.test/a-1.apk',
            'published_at' => now()->subDays(10),
        ]);
        AppRelease::create([
            'platform' => 'ios',
            'version_name' => '9.9.9',
            'version_code' => 99,
            'min_supported_code' => 99,
            'apk_url' => 'https://example.test/ios.ipa',
            'published_at' => now()->subDay(),
        ]);

        $res = $this->getJson('/api/v1/app/update-info?platform=android')->assertOk();

        $this->assertSame('1.0.1', $res->json('release.version_name'));
        $this->assertSame(2, $res->json('min_supported_code'));
    }

    public function test_release_command_registers_apk_and_sha256(): void
    {
        Storage::disk('local')->deleteDirectory('releases');
        $apk = tempnam(sys_get_temp_dir(), 'app').'.apk';
        file_put_contents($apk, str_repeat('dummy-apk-bytes', 1024));

        $this->artisan('app:release-apk', [
            'apk' => $apk,
            '--version-name' => '1.0.2',
            '--version-code' => 2,
            '--min-supported-code' => 1,
            '--notes' => 'Perbaikan uji rilis',
        ])->assertExitCode(0);

        Storage::disk('local')->assertExists('releases/onezentra-2.apk');
        $release = AppRelease::where('version_code', 2)->firstOrFail();
        $this->assertSame('1.0.2', $release->version_name);
        $this->assertSame('perbaikan uji rilis', mb_strtolower($release->notes));
        $this->assertSame(hash_file('sha256', $apk), $release->sha256);
        $this->assertSame(1, $release->min_supported_code);
        $this->assertStringContainsString('/api/v1/releases/2', $release->apk_url);

        unlink($apk);
    }

    public function test_download_endpoint_streams_the_apk_and_404s_otherwise(): void
    {
        Storage::disk('local')->deleteDirectory('releases');
        $apk = sys_get_temp_dir().'/download-test.apk';
        file_put_contents($apk, 'apk-bytes');
        $expectedSha = hash_file('sha256', $apk);

        $this->artisan('app:release-apk', [
            'apk' => $apk,
            '--version-name' => '1.0.2',
            '--version-code' => 12,
            '--notes' => 'x',
        ])->assertExitCode(0);
        unlink($apk);

        $res = $this->get('/api/v1/releases/12');
        $res->assertOk()
            ->assertHeader('Content-Type', 'application/vnd.android.package-archive')
            ->assertHeader('SHA256', $expectedSha);

        $this->get('/api/v1/releases/999')->assertNotFound();
    }

    public function test_release_command_fails_for_missing_apk_or_missing_flags(): void
    {
        $this->artisan('app:release-apk', [
            'apk' => '/tmp/tidak-ada.apk',
            '--version-name' => '1.0.2',
            '--version-code' => 2,
        ])->assertExitCode(1);

        $this->artisan('app:release-apk', [
            'apk' => __FILE__,
        ])->assertExitCode(1);
    }
}
