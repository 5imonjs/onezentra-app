<?php

namespace Database\Seeders;

use App\Models\DepotSetting;
use Illuminate\Database\Seeder;

class DepotSettingSeeder extends Seeder
{
    /**
     * Alamat resmi per depo untuk auto-fill form (asal pengirim dari
     * depo sendiri, alamat tujuan dari depo tujuan). Idempoten via
     * updateOrCreate berdasarkan kode_depo.
     */
    public function run(): void
    {
        $depots = [
            [
                'kode_depo' => '0126',
                'nama_depo' => 'Depo Pontianak',
                'nama_pengirim' => 'OneZentra Pontianak',
                'alamat_pengirim' => 'Jl Trans Kalimantan Ambawang, KM 11',
                'nama_tujuan' => 'Depo Pontianak',
                'alamat_tujuan' => 'Jl Trans Kalimantan Ambawang, KM 11',
            ],
            [
                'kode_depo' => '0127',
                'nama_depo' => 'Depo Singkawang',
                'nama_pengirim' => 'OneZentra Singkawang',
                'alamat_pengirim' => 'Depo Singkawang Pasiran Kota Singkawang',
                'nama_tujuan' => 'Depo Singkawang',
                'alamat_tujuan' => 'Depo Singkawang Pasiran Kota Singkawang',
            ],
        ];

        foreach ($depots as $data) {
            DepotSetting::updateOrCreate(
                ['kode_depo' => $data['kode_depo']],
                $data + ['is_active' => true]
            );
        }

        $this->command->info('Depot settings seeded successfully.');
    }
}
