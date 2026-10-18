<?php

namespace App\Services\Biaya;

use App\Models\Receiving;
use App\Models\RetribusiRate;

/**
 * Logika hitung & pewarisan depo pengajuan Biaya Retribusi.
 */
class BiayaRetribusiCalculator
{
    /**
     * Terapkan logika hitung retribusi: hanya baris receiving yang mengikuti
     * mode koli depo (nominal = qty_zak * rate_zak + qty_crt * rate_crt);
     * baris manual (tanpa receiving_id) selalu memakai nominal manual
     * (borongan) agar tidak termanipulasi client.
     *
     * @param  array<int, array<string, mixed>>  $details
     * @return array<int, array<string, mixed>>
     */
    public function apply(?string $kodeDepo, array $details): array
    {
        $cfg = RetribusiRate::resolveFor($kodeDepo);
        if ($cfg['mode'] !== 'koli') {
            return $details;
        }
        $rateZak = (float) $cfg['rate_zak'];
        $rateCrt = (float) $cfg['rate_crt'];

        return array_map(fn ($detail) => empty($detail['receiving_id']) ? $detail : array_merge($detail, [
            'nominal_biaya' => ((float) ($detail['qty_zak'] ?? 0)) * $rateZak
                + ((float) ($detail['qty_crt'] ?? 0)) * $rateCrt,
        ]), $details);
    }

    /**
     * Bila seluruh baris berasal dari receiving yang se-depo, pengajuan
     * mewarisi depo receiving (bukan depo pembuat) agar tarif koli,
     * laporan, dan filter depo konsisten siapa pun yang membuat.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function inheritReceivingDepot(array $validated): array
    {
        $details = $validated['details'] ?? [];
        if (count($details) === 0) {
            return $validated;
        }
        foreach ($details as $detail) {
            if (empty($detail['receiving_id'])) {
                return $validated;
            }
        }
        $depots = Receiving::query()
            ->whereIn('id', collect($details)->pluck('receiving_id')->unique()->values())
            ->with('rencanaKirim')
            ->get()
            ->map(fn (Receiving $r) => [$r->rencanaKirim?->kode_depo, $r->rencanaKirim?->nama_depo])
            ->unique()
            ->values();
        if ($depots->count() !== 1 || blank($depots->first()[0])) {
            return $validated;
        }
        $validated['kode_depo'] = $depots->first()[0];
        $validated['nama_depo'] = $depots->first()[1] ?? $depots->first()[0];

        return $validated;
    }
}
