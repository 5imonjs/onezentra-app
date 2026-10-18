<?php

namespace App\Services\Biaya;

use App\Models\BiayaRetribusiDetail;
use App\Models\BiayaThlDetail;
use App\Models\Receiving;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Validasi rujukan (referensi) pada pengajuan Biaya Retribusi: sumber THL
 * yang disalin dan receiving yang diklaim tidak boleh lintas depo / ganda.
 */
class BiayaRetribusiReferenceValidator
{
    /**
     * @param  array<int, array<string, mixed>>  $details
     */
    public function validateThlReferences(Request $request, array $details): void
    {
        foreach ($details as $index => $detail) {
            if (empty($detail['biaya_thl_detail_id'])) {
                continue;
            }

            $source = BiayaThlDetail::query()
                ->with('biayaThl')
                ->find($detail['biaya_thl_detail_id']);

            $valid = $source
                && $source->biaya_thl_id === ($detail['biaya_thl_id'] ?? null)
                && $source->biayaThl?->status === 'approved';

            if ($valid && $request->user()->isDepotScoped()) {
                $valid = $source->biayaThl->kode_depo === $request->user()->kode_depo
                    && $source->biayaThl->nama_depo === $request->user()->nama_depo;
            }

            if (! $valid) {
                throw ValidationException::withMessages([
                    "details.{$index}.biaya_thl_detail_id" => 'Sumber THL tidak valid untuk depo pengguna.',
                ]);
            }
        }
    }

    /**
     * Pastikan receiving sumber sudah COMPLETED, divalidasi checker,
     * se-depo dengan pengguna, dan belum diklaim retribusi lain.
     *
     * @param  array<int, array<string, mixed>>  $details
     */
    public function validateReceivingReferences(Request $request, array $details, ?int $exceptRetribusiId = null): void
    {
        foreach ($details as $index => $detail) {
            if (empty($detail['receiving_id'])) {
                continue;
            }

            $receiving = Receiving::query()->with('rencanaKirim')->find($detail['receiving_id']);

            $valid = $receiving
                && $receiving->status === 'COMPLETED'
                && $receiving->checked_by !== null;

            if ($valid && $request->user()->isDepotScoped()) {
                $valid = $receiving->rencanaKirim
                    && $receiving->rencanaKirim->kode_depo === $request->user()->kode_depo;
            }

            if ($valid) {
                $claimed = BiayaRetribusiDetail::query()
                    ->where('receiving_id', $detail['receiving_id'])
                    ->when($exceptRetribusiId, fn ($q) => $q->where('biaya_retribusi_id', '!=', $exceptRetribusiId))
                    ->exists();
                $valid = ! $claimed;
            }

            if (! $valid) {
                throw ValidationException::withMessages([
                    "details.{$index}.receiving_id" => 'Receiving tidak valid: harus COMPLETED tervalidasi checker, se-depo, dan belum diklaim.',
                ]);
            }
        }
    }
}
