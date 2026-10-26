<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        /*
         * Disk bukti (foto validasi, dokumen biaya) sengaja memakai nama
         * "public" demi kompatibilitas kode lama, tetapi root-nya privat:
         * tidak ada file baru yang bisa diakses langsung lewat /storage.
         * Semua akses harus melewati endpoint API ber-otorisasi.
         *
         * File lama dari storage/app/public tetap bisa dibaca lewat disk
         * `public_legacy` (fallback) sampai `php artisan evidence:migrate
         * --apply` dipindahkan ke root privat.
         */
        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/private/evidence'),
            'url' => rtrim(env('APP_URL', 'http://localhost'), '/').'/api/v1/storage',
            'visibility' => 'private',
            'throw' => false,
            'report' => false,
        ],

        'public_legacy' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'throw' => false,
            'report' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
            'report' => false,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    /*
     * Jangan membuat symlink public/storage. File bukti sekarang privat dan
     * hanya boleh disajikan oleh StorageController setelah cek autentikasi +
     * kepemilikan depo. Deploy lama yang sudah punya symlink harus
     * menghapusnya sekali (lihat `php artisan evidence:migrate --apply`).
     */
    'links' => [],

];
