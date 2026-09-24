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

    /*
    |--------------------------------------------------------------------------
    | Logika hitung retribusi per depo
    |--------------------------------------------------------------------------
    | mode 'borongan' : user input qty zak/crt sebagai info, nominal rupiah
    |   diisi manual.
    | mode 'koli'     : nominal dihitung otomatis qty_zak * rate_zak +
    |   qty_crt * rate_crt (backend menghitung ulang saat store/update
    |   agar tidak bisa dimanipulasi dari client).
    | Tambah entri baru per kode depo bila depo lain memakai tarif koli.
    */
    'retribusi_depo' => [
        'default' => [
            'mode' => env('BIAYA_RETRIBUSI_MODE', 'borongan'),
            'rate_zak' => (int) env('BIAYA_RETRIBUSI_RATE_ZAK', 0),
            'rate_crt' => (int) env('BIAYA_RETRIBUSI_RATE_CRT', 0),
        ],
        '0127' => [
            'mode' => env('BIAYA_RETRIBUSI_0127_MODE', 'koli'),
            'rate_zak' => (int) env('BIAYA_RETRIBUSI_0127_RATE_ZAK', 1500),
            'rate_crt' => (int) env('BIAYA_RETRIBUSI_0127_RATE_CRT', 480),
        ],
    ],
];
