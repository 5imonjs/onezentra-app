<?php

use App\Http\Middleware\ScopeRegionDepo;
use App\Http\Middleware\CheckPermission;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\TrackUserActivity;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        // SecurityHeaders harus paling luar agar 401/422/500 juga ber-header.
        $middleware->prependToGroup('api', SecurityHeaders::class);
        $middleware->appendToGroup('api', TrackUserActivity::class);
        $middleware->appendToGroup('api', ScopeRegionDepo::class);
        $middleware->alias([
            'permission' => CheckPermission::class,
            'track.activity' => TrackUserActivity::class,
            'scope.region.depo' => ScopeRegionDepo::class,
        ]);

        $middleware->redirectGuestsTo(function () {
            $frontendUrl = rtrim((string) config('app.frontend_url', 'http://localhost:3000'), '/');

            return $frontendUrl.'/login';
        });
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }

            // Aplikasi ini API-only (routes/web.php kosong, tidak ada route
            // bernama "login"), jadi jangan pernah memanggil route('login').
            $frontendLogin = rtrim((string) config('app.frontend_url', 'http://localhost:3000'), '/').'/login';

            return redirect()->guest($frontendLogin);
        });

        // Non-debug: sembunyikan detail internal (trace/pesan mentah) dari
        // respons JSON — berlaku bila config('app.debug') false, apa pun
        // nilai APP_ENV. Error 4xx client (validasi/otorisasi/404)
        // tetap memakai pesan spesifiknya; hanya 5xx yang digenerikkan.
        $exceptions->render(function (Throwable $e, Request $request) {
            if (! ($request->is('api/*') || $request->expectsJson())) {
                return null;
            }
            if ($e instanceof AuthenticationException || $e instanceof ValidationException) {
                return null;
            }
            $status = $e instanceof HttpExceptionInterface ? $e->getStatusCode() : 500;
            if ($status < 500) {
                return null;
            }
            if (! config('app.debug')) {
                return response()->json(['message' => 'Server error.'], $status);
            }

            return null;
        });
    })->create();
