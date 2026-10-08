<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    'allowed_origins' => array_values(array_filter(array_map(
        fn ($origin) => trim((string) $origin),
        explode(',', (string) env('FRONTEND_URL', 'http://localhost:3000,http://127.0.0.1:3000'))
    ))),
    // JANGAN pakai allowed_origins_patterns localhost:port-bebas — pola
    // permisif + supports_credentials=true membuat halaman web mana pun di
    // port localhost mana pun bisa mengirim request ber-cookie ke API.
    // Origin tambahan didaftarkan eksplisit via FRONTEND_URL (koma).
    'allowed_origins_patterns' => [],
    // Header eksplisit (JANGAN '*'): preflight memantulkan daftar ini dan
    // wildcard menyulitkan audit. X-XSRF-TOKEN dipakai Sanctum SPA,
    // X-Requested-With menandai request AJAX.
    'allowed_headers' => ['Authorization', 'Content-Type', 'X-XSRF-TOKEN', 'X-Requested-With', 'Accept', 'Origin'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
