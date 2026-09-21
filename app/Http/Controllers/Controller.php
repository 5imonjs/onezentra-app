<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

abstract class Controller
{
    /**
     * Return the authenticated user as concrete User model (for Intelephense).
     */
    protected function currentUser(): User
    {
        /** @var User $user */
        $user = auth()->user();

        return $user;
    }

    /**
     * Ambil per_page yang aman: integer 1-100, default 20.
     */
    protected function perPage(Request $request, int $default = 20): int
    {
        return min(max($request->integer('per_page', $default), 1), 100);
    }
}
