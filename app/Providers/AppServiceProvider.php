<?php

namespace App\Providers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // N+1 terdeteksi dini: di luar produksi, akses relasi yang belum
        // di-eager-load melempar exception alih-alih diam-diam menembak query
        // tambahan per baris. Produksi dibiarkan longgar agar respons tak
        // pernah gagal hanya karena relasi yang belum dimuat.
        Model::preventLazyLoading(! app()->isProduction());
    }
}
