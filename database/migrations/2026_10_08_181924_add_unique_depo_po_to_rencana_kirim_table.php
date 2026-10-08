<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     Backstop DB untuk guard app-level (Rule::unique di store/update,
    exists() di import): dua store/import konkuren dengan PO sama sedepo
    tidak boleh lolos dua-duanya. Baris kode_depo NULL dikecualikan oleh
    sifat NULL MySQL/SQLite — import menolak baris tanpa depo (lihat
    RencanaKirimImport) sehingga celah itu tertutup dari sisi tulis.

    Aman untuk prod berduplikat historis: sebelum constraint dipasang,
    PO ganda sedepo dideduplikasi otomatis — baris tertua menyimpan PO
    asli, sisanya di-rename "{PO}-DUP-{id}" (tidak ada baris yang
    dihapus). Daftar rename dicatat di log untuk audit manual.
     */
    public function up(): void
    {
        $this->deduplicateHistoricalPos();

        Schema::table('rencana_kirim', function (Blueprint $table) {
            $table->unique(['kode_depo', 'po_transporter'], 'rk_depo_po_unique');
        });
    }

    public function down(): void
    {
        Schema::table('rencana_kirim', function (Blueprint $table) {
            $table->dropUnique('rk_depo_po_unique');
        });
    }

    private function deduplicateHistoricalPos(): void
    {
        // Kolasi MySQL umum (utf8mb4_*) case-insensitive: 'PO-1' vs 'po-1'
        // melanggar unique yang sama — kelompokkan via LOWER agar portabel.
        $rows = DB::table('rencana_kirim')
            ->select('id', 'kode_depo', 'po_transporter')
            ->whereNotNull('kode_depo')
            ->whereNotNull('po_transporter')
            ->orderBy('id')
            ->get();

        $groups = [];
        foreach ($rows as $row) {
            $groups[$row->kode_depo."\0".mb_strtolower($row->po_transporter)][] = $row;
        }

        $renamed = [];
        foreach ($groups as $group) {
            if (count($group) < 2) {
                continue;
            }
            // Tertua (id terkecil) menyimpan PO asli.
            foreach (array_slice($group, 1) as $dupe) {
                $suffix = '-DUP-'.$dupe->id;
                $newPo = mb_substr($dupe->po_transporter, 0, 100 - mb_strlen($suffix)).$suffix;
                DB::table('rencana_kirim')->where('id', $dupe->id)->update(['po_transporter' => $newPo]);
                $renamed[] = ['id' => $dupe->id, 'from' => $dupe->po_transporter, 'to' => $newPo];
            }
        }

        if ($renamed !== []) {
            Log::warning('rk_depo_po_unique: renamed '.count($renamed).' duplicate PO(s) before adding constraint.', $renamed);
        }
    }
};
