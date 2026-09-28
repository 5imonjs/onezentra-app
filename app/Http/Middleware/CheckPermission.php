<?php

namespace App\Http\Middleware;

use App\Models\User;
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

        /** @var User $user */
        $user = auth()->user();
        if ($user->hasAnyPermission($allowedSlugs)) {
            return $next($request);
        }

        // Return required permissions for better client-side error handling
        return response()->json([
            'message' => 'Anda tidak memiliki izin untuk melakukan aksi ini.',
            'required_permissions' => $allowedSlugs,
        ], Response::HTTP_FORBIDDEN);
    }
}
