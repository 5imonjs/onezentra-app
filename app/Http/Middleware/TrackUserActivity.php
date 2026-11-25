<?php

namespace App\Http\Middleware;

use App\Jobs\LogUserActivity;
use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
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

        // Login/logout dicatat eksplisit oleh AuthController sebagai LOGIN/
        // LOGOUT. Lewati di sini agar satu peristiwa tidak tercatat dua kali
        // (mis. logout yang sudah punya user terautentikasi).
        $isAuthEvent = $request->is(
            'api/*/login',
            'api/*/mobile/login',
            'api/*/logout',
            'api/*/mobile/logout',
        );

        // Activity feed & halaman riwayat tidak boleh mencatat dirinya sendiri:
        // polling 5 detik dan paginasi akan membanjiri log dengan request baca
        // yang tidak mengubah data. Cocokkan segmen path secara eksplisit (bukan
        // wildcard `*` yang juga menangkap `v2`) agar benar bila versi API berubah.
        $pathSegments = $request->segments();
        $isActivityRead = count($pathSegments) >= 2
            && $pathSegments[0] === 'api'
            && $pathSegments[1] === 'v1'
            && ($pathSegments[2] ?? null) === 'dashboard'
            && ($pathSegments[3] ?? null) === 'activity'
            && in_array($pathSegments[4] ?? null, ['live', 'history'], true);

        if ($user !== null && ! $isAuthEvent && ! $isActivityRead && $request->is('api/*') && $request->method() !== 'OPTIONS') {
            // Nama route otomatis (`generated::...`) tidak bisa dibaca manusia
            // dan berubah setiap route:cache dibangun ulang. Simpan PATH agar
            // modul aktivitas (rencana-kirim, gate, receiving, ...) tetap bisa
            // diklasifikasikan dan riwayat tidak kehilangan konteks.
            $routeName = $request->route()?->getName();
            $route = ($routeName !== null && ! str_starts_with($routeName, 'generated::'))
                ? $routeName
                : $request->path();

            // Nama perangkat hanya tersedia untuk request Bearer (mobile).
            // Untuk session/curl, IP + User-Agent yang jadi jejak perangkat.
            $token = $user->currentAccessToken();
            $deviceName = $token instanceof PersonalAccessToken
                ? $token->name
                : null;

            // afterResponse() mengeksekusi job secara sinkron SETELAH respons
            // terkirim (bukan lewat antrean), jadi log tetap tercatat walau
            // queue worker tidak berjalan dan latency API tidak bertambah.
            dispatch(new LogUserActivity(
                $user->id,
                $request->method(),
                $route,
                now()->toDateTimeString(),
                $request->ip(),
                $request->userAgent(),
                $deviceName,
            ))->afterResponse();
        }

        return $response;
    }
}
