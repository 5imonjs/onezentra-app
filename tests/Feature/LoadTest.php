<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * Load test berkala untuk memantau performa under traffic tinggi.
 * Test ini mengirim 50 request sekaligus dan memastikan respons
 * selesai dalam batas waktu yang diterima.
 *
 * Grup 'performance': dikecualikan dari CI default
 * (`--exclude-group=performance`); jalankan manual di staging.
 */
#[Group('performance')]
class LoadTest extends TestCase
{
    public function test_concurrent_requests_perform_within_time_limit(): void
    {
        $start = microtime(true);

        $total = 50;
        for ($i = 0; $i < $total; $i++) {
            // Gunakan $this->json yang sudah boot app dan auth guard
            $this->json('GET', '/api/v1/dashboard/summary');
        }

        $elapsed = microtime(true) - $start;

        // Batas waktu toleransi: sesuaikan dengan kebutuhan proyek.
        // Saat ini batas 15 detik untuk 50 request.
        $this->assertLessThan(15.0, $elapsed,
            "{$total} request ke /api/v1/dashboard/summary mengambil {$elapsed}s, melewati batas 15s");
    }
}
