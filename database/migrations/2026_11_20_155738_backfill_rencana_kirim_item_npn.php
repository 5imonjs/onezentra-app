<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Item rencana kirim lama punya kode_barang tapi npn_id kosong, sehingga
     * kubikasi tidak bisa dihitung. Hubungkan kembali ke master NPN lewat
     * kode_barang (BOSnetszProductId, fallback SAPszProductId).
     */
    public function up(): void
    {
        $items = DB::table('rencana_kirim_items')
            ->whereNull('npn_id')
            ->whereNotNull('kode_barang')
            ->select('id', 'kode_barang')
            ->get();

        foreach ($items as $item) {
            $code = strtoupper(trim((string) $item->kode_barang));
            if ($code === '') {
                continue;
            }

            $npn = DB::table('npn')->where('BOSnetszProductId', $code)->first();
            if (! $npn) {
                // SAP id hanya dipakai bila unik — hindari tautan keliru.
                $sapMatches = DB::table('npn')->where('SAPszProductId', $code)->limit(2)->get();
                $npn = $sapMatches->count() === 1 ? $sapMatches->first() : null;
            }

            if ($npn) {
                DB::table('rencana_kirim_items')
                    ->where('id', $item->id)
                    ->update(['npn_id' => $npn->id]);
            }
        }
    }

    public function down(): void
    {
        // Backfill sengaja tidak dibatalkan: npn_id adalah data operasional.
    }
};
