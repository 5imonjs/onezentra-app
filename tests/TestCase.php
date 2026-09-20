<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Pengaman lapis kedua: tests wajib berjalan di sqlite in-memory.
        // Lapis pertama adalah phpunit.xml yang mengarahkan APP_CONFIG_CACHE /
        // APP_ROUTES_CACHE / APP_EVENTS_CACHE ke path yang tidak ada, sehingga
        // cache dev (bootstrap/cache/config.php) diabaikan saat tes dan override
        // DB_CONNECTION=sqlite:memory selalu berlaku. Tanpa itu, RefreshDatabase
        // bisa menjalankan migrate:fresh ke database MySQL asli dan menghapus data.
        if (config()->get('database.default') !== 'sqlite'
            || config()->get('database.connections.sqlite.database') !== ':memory:') {
            throw new \RuntimeException(
                'Tests must run on in-memory sqlite. '
                .'Hapus bootstrap/cache/config.php (php artisan config:clear) lalu jalankan ulang tes.'
            );
        }
    }
}
