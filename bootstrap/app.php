<?php

use App\Http\Middleware\CheckPermission;
use App\Http\Middleware\TrackUserActivity;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->appendToGroup('api', [TrackUserActivity::class]);
        $middleware->alias([
            'permission' => CheckPermission::class,
            'track.activity' => TrackUserActivity::class,
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
    })->create();
