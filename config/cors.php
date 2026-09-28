<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => array_values(array_filter(array_map(
        fn ($origin) => trim((string) $origin),
        explode(',', (string) env('FRONTEND_URL', 'http://localhost:3000,http://127.0.0.1:3000'))
    ))),
    // JANGAN pakai allowed_origins_patterns localhost:port-bebas — pola
    // permisif + supports_credentials=true membuat halaman web mana pun di
    // port localhost mana pun bisa mengirim request ber-cookie ke API.
    // Origin tambahan didaftarkan eksplisit via FRONTEND_URL (koma).
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => true,
];
