<?php

use App\Models\ReceivingItem;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Isi kolom pendukung group/filter yang masih NULL/kosong pada item hasil
     * materialisasi validasi SJ lama (sebelum dicap saat create): depo, tanggal
     * penerimaan, dan sumber material diambil dari induk rencana kirim.
     * Hanya menyentuh baris yang kosong — tidak mengubah data terisi.
     */
    public function up(): void
    {
        ReceivingItem::query()
            ->whereNotNull('receiving_id')
            ->where(fn ($q) => $q
                ->whereNull('kode_depo')->orWhere('kode_depo', '')
                ->orWhereNull('tanggal_penerimaan')
                ->orWhereNull('sumber_material'))
            ->with(['receiving.rencanaKirim'])
            ->chunkById(200, function ($items) {
                foreach ($items as $item) {
                    $rk = $item->receiving?->rencanaKirim;
                    if (! $rk) {
                        continue;
                    }
                    $patch = [];
                    if (blank($item->getRawOriginal('kode_depo'))) {
                        $patch['kode_depo'] = $rk->kode_depo;
                    }
                    if (blank($item->getRawOriginal('nama_depo'))) {
                        $patch['nama_depo'] = $rk->nama_depo;
                    }
                    if (blank($item->getRawOriginal('tanggal_penerimaan'))) {
                        $patch['tanggal_penerimaan'] = $item->receiving?->created_at?->toDateString()
                            ?? $rk->created_at?->toDateString()
                            ?? today()->toDateString();
                    }
                    if (blank($item->getRawOriginal('sumber_material'))) {
                        $patch['sumber_material'] = $rk->shipper_name;
                    }
                    if ($patch !== []) {
                        $item->update($patch);
                    }
                }
            });
    }

    public function down(): void
    {
        // Backfill tidak reversibel (nilai asal tidak terekam).
    }
};
