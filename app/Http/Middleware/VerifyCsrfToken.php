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
    ];
}
