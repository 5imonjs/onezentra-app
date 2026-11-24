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

                $this->applyQuantitiesToDetail($biaya, $detail, $quantities);
                $touched[$biaya->id] = true;
            }

            $this->refreshTotals($touched);
        });

        Log::info('Biaya retribusi disinkronkan ulang dengan qty receiving.', [
            'receiving_id' => $receivingId,
            'details' => $details->count(),
        ]);
    }

    /**
     * Recompute every linked detail (and totals) straight from the ledger,
     * regardless of the current Biaya status. Serves the "Refresh dari
     * penerimaan" action on the pengajuan form so a stored line that already
     * drifted can be realigned with the current receiving qty.
     */
    public function resyncFromLedger(int $biayaRetribusiId): void
    {
        $details = BiayaRetribusiDetail::where('biaya_retribusi_id', $biayaRetribusiId)->get();
        if ($details->isEmpty()) {
            return;
        }

        $touched = [];

        DB::transaction(function () use ($details, &$touched): void {
            $biayas = BiayaRetribusi::whereKey($details->pluck('biaya_retribusi_id')->unique()->values()->all())
                ->lockForUpdate()->get()->keyBy('id');
            $receivings = Receiving::whereIn('id', $details->pluck('receiving_id')->filter()->unique()->values()->all())
                ->with('items')->get()->keyBy('id');

            foreach ($details as $detail) {
                $biaya = $biayas->get($detail->biaya_retribusi_id);
                $receiving = $detail->receiving_id !== null
                    ? $receivings->get($detail->receiving_id)
                    : null;
                if (! $biaya || $receiving === null) {
                    // Baris manual (tidak ada receiving): nominal tetap
                    // diisi sendiri — tipis di arti ini tidak bisa ditembusi
                    // dari ledger, tapi koreksi qty di penerimaan tetap
                    // terbawa kalau ada receiving id.
                    continue;
                }

                $quantities = $this->calculator->quantitiesForReceiving($receiving);
                $this->applyQuantitiesToDetail($biaya, $detail, $quantities);
                $touched[$biaya->id] = true;
            }

            $this->refreshTotals($touched);
        });

        if (! empty($touched)) {
            Log::info('Biaya retribusi direfresh dari penerimaan.', [
                'biaya_retribusi_id' => $biayaRetribusiId,
            ]);
        }
    }

    /**
     * Recompute detail qty fields from receiving + re-apply rate (koli mode).
     */
    private function applyQuantitiesToDetail(BiayaRetribusi $biaya, BiayaRetribusiDetail $detail, array $quantities): void
    {
        $applied = $this->calculator->apply($biaya->kode_depo, [[
            'receiving_id' => $detail->receiving_id,
            'qty_zak' => $quantities['qty_zak'],
            'qty_crt' => $quantities['qty_crt'],
        ]])[0];

        $detail->update([
            'qty_zak' => $quantities['qty_zak'],
            'qty_crt' => $quantities['qty_crt'],
            'nominal_biaya' => $applied['nominal_biaya'],
        ]);
    }

    /**
     * Recompute `biaya_retribusis` total nominal + rfah flag for the touched ids.
     *
     * @param  array<int, true>  $touched
     */
    private function refreshTotals(array $touched): void
    {
        foreach (array_keys($touched) as $biayaId) {
            $biaya = BiayaRetribusi::whereKey($biayaId)->lockForUpdate()->first();
            if (! $biaya) {
                continue;
            }

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
    }
}
