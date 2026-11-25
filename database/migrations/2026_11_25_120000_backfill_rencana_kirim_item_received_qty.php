<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * `received_qty` dulu hanya di-increment saat scan receiving, sehingga
     * receiving yang lahir dari Validasi SJ tidak pernah menyentuhnya.
     * Isi ulang dari buku besar receiving_items agar laporan/ekspor tidak
     * menampilkan "Qty Diterima = 0" padahal barang sudah diterima.
     */
    public function up(): void
    {
        $totals = DB::table('receiving_items')
            ->join('receivings', 'receivings.id', '=', 'receiving_items.receiving_id')
            ->where('receivings.status', '!=', 'CANCELLED')
            ->where(function ($q): void {
                $q->whereNotNull('receiving_items.sj_validation_item_id')
                    ->orWhereNotNull('receiving_items.sj_validation_extra_item_id');
            })
            ->groupBy('receiving_items.rencana_kirim_item_id')
            ->selectRaw('receiving_items.rencana_kirim_item_id as item_id, SUM(receiving_items.actual_qty) as total')
            ->pluck('total', 'item_id');

        DB::table('rencana_kirim_items')
            ->select(['id', 'received_qty'])
            ->orderBy('id')
            ->chunkById(500, function ($items) use ($totals): void {
                foreach ($items as $item) {
                    $total = round((float) ($totals[$item->id] ?? 0), 2);
                    if (abs((float) $item->received_qty - $total) > 0.001) {
                        DB::table('rencana_kirim_items')
                            ->where('id', $item->id)
                            ->update(['received_qty' => $total]);
                    }
                }
            });
    }

    public function down(): void
    {
        // Koreksi data sengaja tidak dibatalkan.
    }
};
