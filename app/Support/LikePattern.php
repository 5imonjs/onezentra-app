<?php

namespace App\Support;

/**
 * Pola pencarian `LIKE %term%` dengan wildcard (`\`, `%`, `_`) di-escape agar
 * dicari sebagai teks biasa, bukan pola. Ini satu-satunya implementasi escape
 * LIKE di aplikasi — dipakai controller (lewat `Controller::likeContains()`),
 * export, dan service.
 *
 * Selalu pasangkan hasilnya dengan klausa `LIKE ? ESCAPE ?` (escape char `'\'`).
 * Backslash bukan escape default di SQLite, jadi `ESCAPE` wajib ditulis eksplisit
 * agar perilaku MySQL dan SQLite (tes) identik.
 */
final class LikePattern
{
    public static function contains(string $term): string
    {
        return '%'.addcslashes($term, '\\%_').'%';
    }
}
