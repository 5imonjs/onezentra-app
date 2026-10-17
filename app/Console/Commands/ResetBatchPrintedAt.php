<?php

namespace App\Console\Commands;

use App\Models\Batch;
use Illuminate\Console\Command;

/**
 * Kosongkan `printed_at` batch label yang salah ditandai "tercetak".
 *
 * Latar belakang: bug cetak label di web (frame blob diblokir CSP) membuat
 * tombol "Cetak" MENANDAI label tercetak walau print() gagal. Akibatnya tombol
 * berubah jadi "Cetak Ulang" dan badge "Label tercetak" walau label belum
 * pernah keluar dari printer. Setelah bug-nya diperbaiki, label yang telanjur
 * salah tandai tetap terbaca "Cetak Ulang" karena statusnya tersimpan server.
 *
 * Scope default sengaja sesi `IN_PROGRESS`: sesi COMPLETED lolos hard gate
 * "semua label wajib tercetak", jadi labelnya dianggap memang sudah dicetak.
 */
class ResetBatchPrintedAt extends Command
{
    protected $signature = 'batches:reset-printed
        {--validation= : Batasi ke batch milik sesi validasi (id) ini}
        {--status=IN_PROGRESS : Batasi ke batch milik sesi validasi berstatus ini}
        {--all : Reset semua batch, abaikan status sesi}
        {--dry-run : Tampilkan saja tanpa mengubah data}';

    protected $description = 'Kosongkan printed_at batch label yang salah ditandai tercetak supaya tombol kembali "Cetak"';

    public function handle(): int
    {
        $query = Batch::query()->whereNotNull('printed_at');

        if ($validationId = $this->option('validation')) {
            $query->whereHas('validationItem', fn ($q) => $q->where('sj_validation_id', $validationId));
            $scope = "sesi validasi #{$validationId}";
        } elseif ($this->option('all')) {
            $scope = 'SEMUA batch';
        } else {
            $status = (string) $this->option('status');
            $query->whereHas('validationItem.validation', fn ($q) => $q->where('status', $status));
            $scope = "sesi validasi berstatus {$status}";
        }

        $count = (clone $query)->count();

        if ($count === 0) {
            $this->info("Tidak ada batch tercetak pada {$scope}. Tidak ada yang diubah.");

            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            $this->warn("DRY RUN: {$count} batch pada {$scope} AKAN direset (printed_at = NULL).");

            return self::SUCCESS;
        }

        $query->update(['printed_at' => null]);

        $this->info("Selesai. {$count} batch pada {$scope} direset — tombolnya kembali menjadi \"Cetak\".");

        return self::SUCCESS;
    }
}
