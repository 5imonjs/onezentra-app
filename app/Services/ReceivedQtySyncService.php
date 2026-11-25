<?php

namespace App\Services;

use App\Models\ReceivingItem;
use App\Models\RencanaKirimItem;

/**
 * Menjaga kolom `received_qty` di rencana_kirim_items tetap identik dengan
 * buku besar receiving_items.
 *
 * Kolom ini dipakai Laporan Replenishment & ekspornya. Selama hanya diisi
 * lewat increment saat scan, alur yang membuat receiving dari Validasi SJ
 * tidak pernah menyentuhnya — akibatnya "Qty Diterima" tetap 0 walaupun
 * penerimaan sudah berisi qty aktual.
 */
class ReceivedQtySyncService
{
    /**
     * Hitung ulang SELURUH baris rencana kirim dari receiving yang masih
     * berlaku (CANCELLED tidak dihitung). Idempoten: aman dipanggil berulang
     * setelah materialisasi, koreksi, scan, maupun pembatalan.
     */
    public function sync(int $rencanaKirimId, bool $validatedOnly = false): void
    {
        $query = ReceivingItem::query()
            ->join('receivings', 'receivings.id', '=', 'receiving_items.receiving_id')
            ->where('receivings.rencana_kirim_id', $rencanaKirimId)
            ->where('receivings.status', '!=', 'CANCELLED');

        if ($validatedOnly) {
            // Baris fallback saat receiving dibuat mengisi actual_qty = jumlah
            // rencana (belum benar-benar diterima). Untuk sinkron dari alur
            // Validasi SJ hanya hitung baris yang memang berasal dari SJ.
            $query->where(function ($q): void {
                $q->whereNotNull('receiving_items.sj_validation_item_id')
                    ->orWhereNotNull('receiving_items.sj_validation_extra_item_id');
            });
        }

        $totals = $query
            ->groupBy('receiving_items.rencana_kirim_item_id')
            ->selectRaw('receiving_items.rencana_kirim_item_id as item_id, SUM(receiving_items.actual_qty) as total')
            ->pluck('total', 'item_id');

        RencanaKirimItem::where('rencana_kirim_id', $rencanaKirimId)
            ->get()
            ->each(function (RencanaKirimItem $item) use ($totals): void {
                $total = round((float) ($totals[$item->id] ?? 0), 2);
                if (abs((float) $item->received_qty - $total) > 0.001) {
                    $item->update(['received_qty' => $total]);
                }
            });
    }
}
