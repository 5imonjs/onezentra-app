<?php

namespace App\Services\Biaya;

use App\Models\BiayaRetribusiDetail;
use App\Models\Receiving;

/**
 * Menurunkan data THL dari penerimaan aktual.
 *
 * THL tetap borongan (nominal diisi pengguna), tapi identitas kendaraan/SJ
 * dan kubikasi tidak boleh stale setelah Validasi SJ dikoreksi.
 */
class BiayaThlCalculator
{
    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function deriveReceivingData(array $validated): array
    {
        $details = $validated['details'] ?? [];
        $ids = collect($details)->pluck('receiving_id')->filter()->unique()->values()->all();

        if ($ids === []) {
            return $validated;
        }

        $receivings = Receiving::whereIn('id', $ids)
            ->with('rencanaKirim.sjValidations')
            ->get()
            ->keyBy('id');

        $retribusiByReceiving = BiayaRetribusiDetail::whereIn('receiving_id', $ids)
            ->get()
            ->keyBy('receiving_id');

        foreach ($details as &$detail) {
            $receivingId = $detail['receiving_id'] ?? null;
            if (! $receivingId || ! $receivings->has($receivingId)) {
                continue;
            }

            /** @var Receiving $receiving */
            $receiving = $receivings->get($receivingId);
            $rencana = $receiving->rencanaKirim;

            if ($rencana) {
                $detail['nopol_kendaraan'] = $rencana->nopol ?: ($detail['nopol_kendaraan'] ?? '');
                $detail['type_kendaraan'] = $rencana->jenis_kendaraan ?: ($detail['type_kendaraan'] ?? '');

                $sj = $rencana->sjValidations
                    ->where('status', 'COMPLETED')
                    ->sortByDesc('completed_at')
                    ->first() ?? $rencana->sjValidations->first();

                if ($sj && filled($sj->scan_code)) {
                    $detail['no_surat_jalan'] = $sj->scan_code;
                }
            }

            $retribusi = $retribusiByReceiving->get($receivingId);
            if ($retribusi) {
                $detail['kubikasi'] = $retribusi->kubikasi;
                $detail['droppoint'] = $retribusi->droppoint;
            }
        }
        unset($detail);

        $validated['details'] = $details;

        return $validated;
    }
}
