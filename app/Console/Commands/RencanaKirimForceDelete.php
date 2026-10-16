<?php

namespace App\Console\Commands;

use App\Models\Batch;
use App\Models\BiayaRetribusiDetail;
use App\Models\RencanaKirim;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Hapus paksa satu rencana kirim beserta seluruh jejaknya TANPA memandang
 * status (DRAFT/SCHEDULED/IN_PROGRESS/COMPLETED/CANCELLED).
 *
 * API hanya mengizinkan hapus DRAFT/CANCELLED tanpa turunan; command ini
 * untuk kebutuhan operasional (data salah input yang sudah terlanjur
 * jalan) dan HANYA dijalankan manual di terminal server oleh admin.
 *
 * Pengaman:
 * - tanpa --force, wajib konfirmasi interaktif (ketik nama PO);
 * - --dry-run hanya menampilkan ringkasan tanpa menghapus;
 * - klaim biaya (receiving yang sudah diklaim retribusi) TIDAK dihapus —
 *   FK-nya di-set null otomatis, dan command menyebutkannya eksplisit;
 * - semua di dalam satu transaksi DB: gagal di tengah = rollback penuh.
 */
class RencanaKirimForceDelete extends Command
{
    protected $signature = 'rencana-kirim:force-delete
        {id : ID rencana kirim yang akan dihapus}
        {--force : lewati konfirmasi interaktif}
        {--dry-run : tampilkan ringkasan tanpa menghapus}';

    protected $description = 'Hapus paksa rencana kirim + turunannya tanpa memandang status (khusus admin via terminal)';

    public function handle(): int
    {
        $rencana = RencanaKirim::withCount([
            'items',
            'gateTransactions',
            'receivings',
            'sjValidations',
        ])->find($this->argument('id'));

        if (! $rencana) {
            $this->error("Rencana kirim #{$this->argument('id')} tidak ditemukan.");

            return self::FAILURE;
        }

        $receivingIds = $rencana->receivings()->pluck('receivings.id')->all();
        $validationIds = $rencana->sjValidations()->pluck('sj_validations.id')->all();
        $claimed = $receivingIds === []
            ? 0
            : BiayaRetribusiDetail::whereIn('receiving_id', $receivingIds)->count();
        $batchCount = $validationIds === []
            ? 0
            : Batch::whereHas('validationItem', fn ($q) => $q->whereIn('sj_validation_id', $validationIds))->count();

        $this->warn('Akan dihapus PERMANEN (tidak bisa undo):');
        $this->table(
            ['Data', 'Jumlah'],
            [
                ["Rencana #{$rencana->id} ({$rencana->po_transporter}) [{$rencana->status}]", 1],
                ['Item rencana', $rencana->items_count],
                ['Gate transactions', $rencana->gate_transactions_count],
                ['Receiving (+items ikut cascade)', $rencana->receivings_count],
                ['Sesi validasi SJ', $rencana->sj_validations_count],
                ['Batch label validasi', $batchCount],
                ['Baris biaya retribusi yang mengklaim receiving ini (FK di-set null, TIDAK dihapus)', $claimed],
            ]
        );

        if ($this->option('dry-run')) {
            $this->info('Dry-run: tidak ada yang dihapus.');

            return self::SUCCESS;
        }

        if (! $this->option('force')) {
            $answer = $this->ask('Ketik PO Transporter untuk konfirmasi hapus', '');
            if (trim((string) $answer) !== trim((string) $rencana->po_transporter)) {
                $this->error('Konfirmasi tidak cocok. Dibatalkan.');

                return self::FAILURE;
            }
        }

        DB::transaction(function () use ($rencana, $receivingIds, $validationIds): void {
            if ($validationIds !== []) {
                Batch::whereHas('validationItem', fn ($q) => $q->whereIn('sj_validation_id', $validationIds))->delete();
                $rencana->sjValidations()->each(fn ($v) => $v->items()->delete());
                $rencana->sjValidations()->delete();
            }
            $rencana->gateTransactions()->delete();
            if ($receivingIds !== []) {
                $rencana->receivings()->each(fn ($r) => $r->items()->delete());
                $rencana->receivings()->delete();
            }
            $rencana->items()->delete();
            $rencana->delete();
        });

        $this->info("Rencana kirim #{$rencana->id} beserta turunannya terhapus.");

        return self::SUCCESS;
    }
}
