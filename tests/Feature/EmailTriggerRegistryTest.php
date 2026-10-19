<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\EmailRecipientController;
use Illuminate\Support\Facades\File;
use ReflectionClass;
use Tests\TestCase;

/**
 * Menjaga peta sumber-kebenaran pasangan dokumen → trigger
 * (EmailRecipientController::DOCUMENT_TRIGGERS) tetap sinkron dengan call-site
 * notifikasi email yang BENAR-BENAR dipakai di aplikasi.
 *
 * Menambah trigger baru lewat `EmailNotificationService::send()` tanpa
 * mendaftarkannya di peta akan menggagalkan test ini — sebelumnya penyimpangan
 * seperti itu hanya terlihat setelah penerima gagal dikonfigurasi di UI.
 */
class EmailTriggerRegistryTest extends TestCase
{
    /**
     * Pasangan dokumen → trigger yang dipakai aplikasi.
     *
     * @return array<string, list<string>>
     */
    private function registry(): array
    {
        /** @var array<string, list<string>> $map */
        $map = (new ReflectionClass(EmailRecipientController::class))->getConstant('DOCUMENT_TRIGGERS');

        return $map;
    }

    /**
     * Seluruh sumber PHP di app/ sebagai [jalur relatif => isi].
     *
     * @return array<string, string>
     */
    private function appSources(): array
    {
        $sources = [];

        foreach (File::allFiles(app_path()) as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }

            $relative = str_replace(app_path().DIRECTORY_SEPARATOR, '', $file->getPathname());
            $sources[$relative] = $file->getContents();
        }

        return $sources;
    }

    public function test_registry_shape_is_valid(): void
    {
        $map = $this->registry();

        $this->assertNotEmpty($map);

        foreach ($map as $documentType => $triggers) {
            $this->assertNotSame('', (string) $documentType);
            $this->assertNotEmpty($triggers, "Dokumen '{$documentType}' tidak memiliki trigger.");
            $this->assertSame(
                array_values(array_unique($triggers)),
                $triggers,
                "Trigger dokumen '{$documentType}' berisi duplikat."
            );
        }
    }

    public function test_every_literal_send_call_site_is_registered(): void
    {
        $map = $this->registry();
        $pattern = '/->send\(\s*([\'"])([a-z_]+)\1\s*,\s*([\'"])([a-z_]+)\3/';
        $scanned = 0;

        foreach ($this->appSources() as $path => $contents) {
            preg_match_all($pattern, $contents, $matches, PREG_SET_ORDER);

            foreach ($matches as $match) {
                $scanned++;
                $documentType = $match[2];
                $trigger = $match[4];

                $this->assertArrayHasKey(
                    $documentType,
                    $map,
                    "Dokumen '{$documentType}' dari {$path} tidak terdaftar di DOCUMENT_TRIGGERS."
                );
                $this->assertContains(
                    $trigger,
                    $map[$documentType],
                    "Trigger '{$trigger}' untuk '{$documentType}' dari {$path} tidak terdaftar di DOCUMENT_TRIGGERS."
                );
            }
        }

        // Jaring pengaman: bila regex berhenti cocok karena format kode berubah,
        // test di atas akan "lolos" tanpa memeriksa apa pun. Pastikan minimal 5
        // call-site literal tetap terbaca.
        $this->assertGreaterThanOrEqual(5, $scanned, 'Tidak ada call-site send() literal yang terbaca — regex perlu diperbarui.');
    }

    public function test_dynamic_send_call_sites_use_registered_triggers(): void
    {
        $map = $this->registry();
        $sources = $this->appSources();

        // Call-site dengan doc type/trigger dari variabel tak bisa dibaca regex
        // `send(...)`, jadi file pemiliknya dipetakan manual lalu seluruh trigger
        // literalnya di dalam file itu divalidasi terhadap peta.
        $dynamicSites = [
            'Services/BiayaApprovalService.php' => ['biaya_thl', 'biaya_retribusi'],
            'Http/Controllers/Api/V1/StandarisasiTumpukanController.php' => ['standarisasi_tumpukan'],
        ];

        foreach ($dynamicSites as $relativePath => $documentTypes) {
            $this->assertArrayHasKey($relativePath, $sources, "Sumber {$relativePath} tidak ditemukan.");

            $triggers = $this->triggerLiterals($sources[$relativePath]);
            $this->assertNotEmpty($triggers, "Tidak ada trigger yang terbaca di {$relativePath}.");

            foreach ($documentTypes as $documentType) {
                $this->assertArrayHasKey($documentType, $map, "Dokumen '{$documentType}' tidak terdaftar di DOCUMENT_TRIGGERS.");

                foreach ($triggers as $trigger) {
                    $this->assertContains(
                        $trigger,
                        $map[$documentType],
                        "Trigger '{$trigger}' dari {$relativePath} tidak terdaftar untuk '{$documentType}'."
                    );
                }
            }
        }
    }

    /**
     * Literal trigger dari pola notify(...)/sendNotification(...)/$trigger = '...'.
     *
     * @return list<string>
     */
    private function triggerLiterals(string $source): array
    {
        $patterns = [
            '/->notify\([^,]+,\s*([\'"])([a-z_]+)\1/',
            '/sendNotification\([^,)]+,\s*([\'"])([a-z_]+)\1/',
            '/\$trigger\s*=\s*([\'"])([a-z_]+)\1/',
        ];

        $triggers = [];

        foreach ($patterns as $pattern) {
            preg_match_all($pattern, $source, $matches, PREG_SET_ORDER);

            foreach ($matches as $match) {
                $triggers[] = $match[2];
            }
        }

        return array_values(array_unique($triggers));
    }
}
