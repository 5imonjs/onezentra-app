<?php

namespace App\Services\Biaya;

use App\Models\ApprovalAssignment;
use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDetail;
use App\Models\Receiving;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Menjaga angka retribusi tetap mengikuti ledger penerimaan.
 *
 * Dipanggil setelah qty receiving berubah (koreksi Validasi SJ, edit
 * receiving item, atau extra item yang disetujui). Hanya pengajuan yang masih
 * bisa diedit yang disentuh — yang sudah dikirim/disetujui tidak diubah
 * diam-diam.
 */
class BiayaRetribusiSyncService
{
    private const EDITABLE_STATUSES = ['draft', 'rejected', 'revisi'];

    public function __construct(private readonly BiayaRetribusiCalculator $calculator) {}

    public function syncForReceiving(int $receivingId): void
    {
        $details = BiayaRetribusiDetail::where('receiving_id', $receivingId)->get();
        if ($details->isEmpty()) {
            return;
        }

        $biayaIds = $details->pluck('biaya_retribusi_id')->unique()->values()->all();

        DB::transaction(function () use ($receivingId, $details, $biayaIds): void {
            Receiving::whereKey($receivingId)->lockForUpdate()->firstOrFail();
            $biayas = BiayaRetribusi::whereIn('id', $biayaIds)->lockForUpdate()->get()->keyBy('id');

            $receiving = Receiving::with('items')->findOrFail($receivingId);
            $quantities = $this->calculator->quantitiesForReceiving($receiving);

            $touched = [];

            foreach ($details as $detail) {
                $biaya = $biayas->get($detail->biaya_retribusi_id);
                if (! $biaya || ! in_array($biaya->status, self::EDITABLE_STATUSES, true)) {
                    continue;
                }

                $applied = $this->calculator->apply($biaya->kode_depo, [[
                    'receiving_id' => $receivingId,
                    'qty_zak' => $quantities['qty_zak'],
                    'qty_crt' => $quantities['qty_crt'],
                ]])[0];

                $detail->update([
                    'qty_zak' => $quantities['qty_zak'],
                    'qty_crt' => $quantities['qty_crt'],
                    'nominal_biaya' => $applied['nominal_biaya'],
                ]);

                $touched[$biaya->id] = true;
            }

            foreach (array_keys($touched) as $biayaId) {
                $biaya = $biayas->get($biayaId);
                $nominal = (float) BiayaRetribusiDetail::where('biaya_retribusi_id', $biayaId)->sum('nominal_biaya');
                $rfahRequired = $nominal > config('biaya.retribusi_rfah_threshold', 1000000);

                $biaya->update([
                    'nominal_biaya' => $nominal,
                    'is_rfah_required' => $rfahRequired,
                    'rfah_name' => $rfahRequired
                        ? ApprovalAssignment::resolveRfahName($biaya->kode_depo, ApprovalAssignment::MODULE_RETRIBUSI)
                        : null,
                ]);
            }
        });

        Log::info('Biaya retribusi disinkronkan ulang dengan qty receiving.', [
            'receiving_id' => $receivingId,
            'details' => $details->count(),
        ]);
    }
}
