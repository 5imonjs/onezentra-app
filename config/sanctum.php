<?php

use App\Http\Middleware\VerifyCsrfToken;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;
use Laravel\Sanctum\Sanctum;

return [

    /*
    | Sanctum membentuk pola "<entri>/*" lalu mencocokkannya dengan header
    | Origin/Referer (lihat EnsureFrontendRequestsAreStateful::fromFrontend).
    | Entri TANPA port tidak menutupi origin ber-port: "localhost" menjadi
    | pola "localhost/*" yang TIDAK cocok dengan "localhost:3000/".
    | Karena itu setiap origin — bukan host-nya saja — harus didaftarkan utuh.
    |
    | Sumbernya FRONTEND_URL, sama dengan config/cors.php, supaya keduanya
    | tidak pernah berbeda: origin yang lolos CORS juga harus diterima Sanctum.
    | Antesnya daftar terpisah, sehingga http://127.0.0.1:3000 lolos CORS lalu
    | ditolak Sanctum — login membalas 200 tanpa menerbitkan cookie sesi, dan
    | setiap request lanjutan berakhir 401.
    */
    /*
    | Sanctum membentuk pola "<entri>/*" lalu mencocokkannya dengan header
    | Origin/Referer (lihat EnsureFrontendRequestsAreStateful::fromFrontend).
    | Dua detail yang sering terlewat di sini:
    |
    | 1. Entri TANPA port tidak menutupi origin ber-port. "localhost" menjadi
    |    pola "localhost/*" yang TIDAK cocok dengan "localhost:3000/", sehingga
    |    tiap origin ber-port harus didaftarkan utuh.
    | 2. Sanctum membuang scheme ("http://") dari domain SEBELUM pencocokan, jadi
    |    entri juga harus TANPA scheme. "http://localhost:3000" tidak akan
    |    pernah cocok.
    |
    | Sumbernya FRONTEND_URL — sama dengan config/cors.php — supaya keduanya
    | tidak bisa berbeda: origin yang lolos CORS harus juga diterima Sanctum.
    | Keduanya sudah berbeda, sehingga http://127.0.0.1:3000 lolos CORS lalu
    | ditolak Sanctum: login membalas 200 tanpa menerbitkan cookie sesi, dan
    | setiap request lanjutan berakhir 401.
    */
    'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', implode(',', array_unique(array_filter(
        array_merge(
            // Scheme dibuang: Sanctum mencocokkan domain tanpa "http://".
            array_map(
                fn ($origin) => preg_replace('#^https?://#', '', trim($origin)),
                explode(',', (string) env('FRONTEND_URL', 'http://localhost:3000'))
            ),
            // Host polos DAN host:port. Sanctum hanya cocokkan "<entri>/*",
            // jadi "127.0.0.1" tidak menutupi "127.0.0.1:3000".
            // Fallback dev/LAN ini HANYA di luar production: di produksi,
            // origin liar seperti localhost tidak boleh dianggap stateful.
            env('APP_ENV') === 'production'
                ? []
                : ['localhost', 'localhost:3000', '127.0.0.1', '127.0.0.1:3000', '127.0.0.1:8000', '::1'],
            [preg_replace('#^https?://#', '', Sanctum::currentApplicationUrlWithPort())],
        )
    ))))),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Guards
    |--------------------------------------------------------------------------
    |
    | This array contains the authentication guards that will be checked when
    | Sanctum is trying to authenticate a request. If none of these guards
    | are able to authenticate the request, Sanctum will use the bearer
    | token that's present on an incoming request for authentication.
    |
    */

    'guard' => ['web'],

    /*
    |--------------------------------------------------------------------------
    | Expiration Minutes
    |--------------------------------------------------------------------------
    |
    | This value controls the number of minutes until an issued token will be
    | considered expired. This will override any values set in the token's
    | "expires_at" attribute, but first-party sessions are not affected.
    |
    */

    'expiration' => (int) env('SANCTUM_TOKEN_EXPIRATION', 480),

    /*
    |--------------------------------------------------------------------------
    | Token Prefix
    |--------------------------------------------------------------------------
    |
    | Sanctum can prefix new tokens in order to take advantage of numerous
    | security scanning initiatives maintained by open source platforms
    | that notify developers if they commit tokens into repositories.
    |
    | See: https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning
    |
    */

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    /*
    |--------------------------------------------------------------------------
    | Sanctum Middleware
    |--------------------------------------------------------------------------
    |
    | When authenticating your first-party SPA with Sanctum you may need to
    | customize some of the middleware Sanctum uses while processing the
    | request. You may change the middleware listed below as required.
    |
    */

    'middleware' => [
        'authenticate_session' => AuthenticateSession::class,
        'encrypt_cookies' => EncryptCookies::class,
        'validate_csrf_token' => VerifyCsrfToken::class,
    ],

];
