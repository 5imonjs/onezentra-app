<?php

namespace Tests\Unit;

use Illuminate\Database\Eloquent\Model;
use Tests\TestCase;

class LazyLoadingGuardTest extends TestCase
{
    /**
     * AppServiceProvider::boot() mengaktifkan guard ini di luar produksi agar
     * akses relasi yang belum di-eager-load (N+1) langsung ketahuan saat
     * tes/dev, bukan diam-diam menembak query tambahan di produksi.
     */
    public function test_lazy_loading_is_prevented_outside_production(): void
    {
        $this->assertFalse(app()->isProduction());
        $this->assertTrue(Model::preventsLazyLoading());
    }
}
