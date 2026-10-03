<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Http\Request;

abstract class Controller
{
    // Menyediakan `authorize()`, `can()`, dan `cannot()`.
    //
    // Dipakai UserPolicy untuk aturan yang butuh knowing actor DAN target
    // (mis. hanya admin master boleh mengubah akun admin master). Gate
    // permission tetap di level route lewat middleware `permission:` — trait
    // ini tidak menggantikannya.
    use AuthorizesRequests;

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
