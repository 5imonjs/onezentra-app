<?php

namespace App\Http\Middleware;

use App\Jobs\LogUserActivity;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TrackUserActivity
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $user = $request->user();

        if ($user !== null && $request->is('api/*') && $request->method() !== 'OPTIONS') {
            // Queue async agar tidak menambah latency API (fix P-1/S-8).
            // Fallback sync jika queue driver = sync/array (testing).
            dispatch(new LogUserActivity(
                $user->id,
                $request->method(),
                $request->route()?->getName() ?? $request->path(),
                now()->toDateTimeString(),
            ))->afterResponse();
        }

        return $response;
    }
}
