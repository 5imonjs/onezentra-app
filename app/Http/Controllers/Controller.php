<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

abstract class Controller
{
    /**
     * Ambil per_page yang aman: integer 1-100, default 20.
     */
    protected function perPage(Request $request, int $default = 20): int
    {
        return min(max($request->integer('per_page', $default), 1), 100);
    }
}
