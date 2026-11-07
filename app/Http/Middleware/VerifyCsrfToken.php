<?php

namespace App\Http\Middleware;

use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken as BaseVerifier;

class VerifyCsrfToken extends BaseVerifier
{
    /**
     * Endpoint Bearer-token mobile tidak memakai cookie sesi (kredensial
     * tidak ambient), sehingga CSRF tidak berlaku dan tidak boleh
     * memblokir Flutter Web yang origin-nya stateful.
     *
     * @var array<int, string>
     */
    protected $except = [
        'api/v1/mobile/*',
        // Validasi Region pra-login: read-only, tidak mengubah session/state,
        // dan dipanggil sebelum user punya cookie CSRF yang bisa diandalkan.
        // Tanpa pengecualian ini, Region Access gagal 419 di browser yang
        // cookie XSRF-nya belum terbit.
        'api/v1/region-validate',
    ];
}
