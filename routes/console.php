<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Hapus token mobile kedaluwarsa setiap hari agar tabel
// personal_access_tokens tidak menumpuk (mobile login per-perangkat).
Schedule::command('sanctum:prune-expired --hours=24')->daily();
