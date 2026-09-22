<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Backfill satu arah untuk pengajuan lama yang sudah direvisi: isi
     * revision_return_status + kembalikan status ke tahap pengembalian
     * (checked untuk RLH, rlh_approved untuk RFAH).
     *
     * Perhatian: down() sengaja no-op dan up() menimpa kolom status live.
     * Jalankan hanya setelah memahami dampaknya per depo.
     */
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        foreach (['biaya_thls', 'biaya_retribusis'] as $tableName) {
            DB::table($tableName.' as biaya')
                ->join('users', 'users.id', '=', 'biaya.revised_by')
                ->whereNotNull('biaya.resubmitted_at')
                ->whereNull('biaya.revision_return_status')
                ->whereIn('users.level', ['rlh', 'rfah'])
                ->select(['biaya.id', 'users.level'])
                ->get()
                ->each(function (object $row) use ($tableName): void {
                    $returnStatus = $row->level === 'rfah' ? 'rlh_approved' : 'checked';
                    DB::table($tableName)->where('id', $row->id)->update([
                        'revision_return_status' => $returnStatus,
                        'status' => $returnStatus,
                    ]);
                });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Backfill is intentionally not reversed to avoid moving live approvals backward.
    }
};
