<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPermission
{
    public function handle(Request $request, Closure $next, string $slugs)
    {
        if (! auth()->check()) {
            return response()->json(['message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
        }

        $allowedSlugs = explode('|', $slugs);

        if (auth()->user()->hasAnyPermission($allowedSlugs)) {
            return $next($request);
        }

        return response()->json(['message' => 'Anda tidak memiliki izin untuk melakukan aksi ini.'], Response::HTTP_FORBIDDEN);
    }
}
