<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tanggal posisi baseline: batas tanggal penerimaan yang sudah tercakup
     * baseline. Dipisahkan dari `imported_at` (waktu input) agar penerimaan
     * lama yang baru diinput belakangan tetap dianggap bagian baseline.
     */
    public function up(): void
    {
        Schema::table('opname_expired_baseline_imports', function (Blueprint $table): void {
            $table->date('baseline_date')->nullable()->after('nama_depo');
        });

        // Manifes lama: pakai tanggal import sebagai posisi baseline.
        DB::table('opname_expired_baseline_imports')
            ->whereNull('baseline_date')
            ->orderBy('id')
            ->get(['id', 'imported_at'])
            ->each(function (object $row): void {
                if ($row->imported_at === null) {
                    return;
                }

                DB::table('opname_expired_baseline_imports')
                    ->where('id', $row->id)
                    ->update(['baseline_date' => substr((string) $row->imported_at, 0, 10)]);
            });
    }

    public function down(): void
    {
        Schema::table('opname_expired_baseline_imports', function (Blueprint $table): void {
            $table->dropColumn('baseline_date');
        });
    }
};
