<?php

namespace App\Services\Biaya;

/**
 * Normalisasi casing detail Biaya agar plat/tipe konsisten kapital di database.
 * Aturan THL lebih luas (kendaraan tambahan + array kendaraan) daripada
 * Retribusi, sehingga disediakan dua metode eksplisit.
 */
class BiayaDetailNormalizer
{
    /**
     * @param  array<int, array<string, mixed>>  $details
     * @return array<int, array<string, mixed>>
     */
    public function forThl(array $details): array
    {
        return array_map(function ($detail) {
            foreach (['nopol_kendaraan', 'kendaraan_nopol', 'type_kendaraan', 'kendaraan_type'] as $field) {
                if (isset($detail[$field])) {
                    $detail[$field] = strtoupper(trim((string) $detail[$field]));
                }
            }
            // Kendaraan tambahan array: uppercase SJ/Nopol/Type per item.
            if (isset($detail['kendaraan']) && is_array($detail['kendaraan'])) {
                foreach ($detail['kendaraan'] as &$vehicle) {
                    foreach (['sj', 'nopol', 'type'] as $field) {
                        if (isset($vehicle[$field])) {
                            $vehicle[$field] = strtoupper(trim((string) $vehicle[$field]));
                        }
                    }
                }
            }

            return $detail;
        }, $details);
    }

    /**
     * @param  array<int, array<string, mixed>>  $details
     * @return array<int, array<string, mixed>>
     */
    public function forRetribusi(array $details): array
    {
        return array_map(function ($detail) {
            if (isset($detail['nopol_kendaraan'])) {
                $detail['nopol_kendaraan'] = strtoupper(trim((string) $detail['nopol_kendaraan']));
            }
            if (isset($detail['type_kendaraan'])) {
                $detail['type_kendaraan'] = strtoupper(trim((string) $detail['type_kendaraan']));
            }

            return $detail;
        }, $details);
    }
}
