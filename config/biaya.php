<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Penanggung jawab RFAH & ambang nominal per modul
    |--------------------------------------------------------------------------
    | Satu-satunya sumber nama RFAH dan ambang batas nominal (dulu tersebar
    | hardcode di controller + halaman frontend). Frontend mengambil nilai
    | runtime lewat GET /api/v1/biaya-config agar tidak drift.
    */
    'rfah_name' => env('BIAYA_RFAH_NAME', 'Umi Marzuqoh'),
    'thl_rfah_threshold' => (int) env('BIAYA_THL_RFAH_THRESHOLD', 750000),
    'retribusi_rfah_threshold' => (int) env('BIAYA_RETRIBUSI_RFAH_THRESHOLD', 1000000),
];
