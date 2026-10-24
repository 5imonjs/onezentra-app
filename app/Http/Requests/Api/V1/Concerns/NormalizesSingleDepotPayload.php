<?php

namespace App\Http\Requests\Api\V1\Concerns;

/**
 * Normalisasi identifier skala-satu (depo, region, partner site) sebelum validasi.
 *
 * Beberapa build klien mengirim kode/nama depo sebagai array satu elemen atau
 * angka, sehingga aturan `string` menolak request yang sebenarnya valid dengan
 * pesan "The kode depo field must be a string.". Satu akun hanya boleh punya
 * satu depo, jadi array dipersempit ke elemen pertamanya dan skalar dikonversi
 * ke string. Aturan bisnis di controller tidak dilonggarkan: depo tetap harus
 * aktif, berada di region akun, dan jumlahnya tepat satu.
 */
trait NormalizesSingleDepotPayload
{
    protected function prepareForValidation(): void
    {
        $normalized = [];

        foreach (['kode_depo', 'nama_depo', 'region_id', 'kode_ps'] as $field) {
            if (! $this->has($field)) {
                continue;
            }

            $value = $this->input($field);
            if (is_array($value)) {
                $value = reset($value);
            }

            $normalized[$field] = is_scalar($value) && $value !== ''
                ? (string) $value
                : null;
        }

        if (is_array($this->input('depot_codes'))) {
            $normalized['depot_codes'] = array_map(
                fn (mixed $code): mixed => is_scalar($code) ? (string) $code : $code,
                $this->input('depot_codes'),
            );
        }

        if ($normalized !== []) {
            $this->merge($normalized);
        }
    }
}
