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
                'kode_depo' => '000',
                'nama_depo' => 'Region JataKalbar',
                'region_id' => 'REG-001',
                'nama_pengirim' => 'OneZentra Region JataKalbar',
                'alamat_pengirim' => 'Jl Trans Kalimantan Ambawang, KM 11',
                'nama_tujuan' => 'Region JataKalbar',
                'alamat_tujuan' => 'Jl Trans Kalimantan Ambawang, KM 11',
            ],
            [
                'kode_depo' => '0126',
                'nama_depo' => 'Depo Pontianak',
                'region_id' => 'REG-001',
                'nama_pengirim' => 'OneZentra Pontianak',
                'alamat_pengirim' => 'Jl Trans Kalimantan Ambawang, KM 11',
                'nama_tujuan' => 'Depo Pontianak',
                'alamat_tujuan' => 'Jl Trans Kalimantan Ambawang, KM 11',
            ],
            [
                'kode_depo' => '0127',
                'nama_depo' => 'Depo Singkawang',
                'region_id' => 'REG-001',
                'nama_pengirim' => 'OneZentra Singkawang',
                'alamat_pengirim' => 'Depo Singkawang Pasiran Kota Singkawang',
                'nama_tujuan' => 'Depo Singkawang',
                'alamat_tujuan' => 'Depo Singkawang Pasiran Kota Singkawang',
            ],
            [
                'kode_depo' => '0128',
                'nama_depo' => 'Depo Ketapang',
                'region_id' => 'REG-001',
                'nama_pengirim' => 'OneZentra Ketapang',
                'alamat_pengirim' => 'Jl Ahmad Yani No. 1',
                'nama_tujuan' => 'Depo Ketapang',
                'alamat_tujuan' => 'Jl Ahmad Yani No. 1',
            ],
            [
                'kode_depo' => '0201',
                'nama_depo' => 'Depo Jakarta Utara',
                'region_id' => 'REG-002',
                'nama_pengirim' => 'OneZentra Jakarta Utara',
                'alamat_pengirim' => 'Jl Pademangan IV No. 10',
                'nama_tujuan' => 'Depo Jakarta Utara',
                'alamat_tujuan' => 'Jl Pademangan IV No. 10',
            ],
            [
                'kode_depo' => '0202',
                'nama_depo' => 'Depo Jakarta Selatan',
                'region_id' => 'REG-002',
                'nama_pengirim' => 'OneZentra Jakarta Selatan',
                'alamat_pengirim' => 'Jl Kebayoran Baru No. 5',
                'nama_tujuan' => 'Depo Jakarta Selatan',
                'alamat_tujuan' => 'Jl Kebayoran Baru No. 5',
            ],
            [
                'kode_depo' => '0203',
                'nama_depo' => 'Depo Bekasi',
                'region_id' => 'REG-002',
                'nama_pengirim' => 'OneZentra Bekasi',
                'alamat_pengirim' => 'Jl Ahmad Yani No. 88',
                'nama_tujuan' => 'Depo Bekasi',
                'alamat_tujuan' => 'Jl Ahmad Yani No. 88',
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
