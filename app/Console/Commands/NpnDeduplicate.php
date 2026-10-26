<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

#[Signature('npn:deduplicate {--apply : Benar-benar gabungkan dan hapus baris duplikat} {--confirm= : Isi DEDUPLICATE NPN untuk mengaktifkan --apply}')]
#[Description('Gabungkan baris NPN dengan BOSnetszProductId sama ke satu baris (dry-run default)')]
class NpnDeduplicate extends Command
{
    public function handle(): int
    {
        $groups = DB::table('npn')
            ->select('BOSnetszProductId', DB::raw('COUNT(*) as aggregate'))
            ->whereNotNull('BOSnetszProductId')
            ->groupBy('BOSnetszProductId')
            ->havingRaw('COUNT(*) > 1')
            ->orderBy('BOSnetszProductId')
            ->get();

        if ($groups->isEmpty()) {
            $this->info('Tidak ada duplikat NPN.');

            return self::SUCCESS;
        }

        $preview = [];
        foreach ($groups as $group) {
            $preview[] = [
                $group->BOSnetszProductId,
                $group->aggregate,
                DB::table('npn')->where('BOSnetszProductId', $group->BOSnetszProductId)->orderBy('id')->pluck('id')->implode(', '),
            ];
        }

        $this->warn('Ditemukan '.$groups->count().' kode duplikat:');
        $this->table(['BOSnetszProductId', 'Baris', 'ID'], $preview);

        if (! $this->option('apply')) {
            $this->line('Dry-run. Tidak ada data yang diubah.');
            $this->line('Untuk menerapkan: --apply --confirm="DEDUPLICATE NPN" (backup dulu).');

            return self::SUCCESS;
        }

        if ($this->option('confirm') !== 'DEDUPLICATE NPN') {
            $this->error('Konfirmasi tidak cocok. Gunakan --confirm="DEDUPLICATE NPN".');

            return self::FAILURE;
        }

        $merged = 0;
        DB::transaction(function () use ($groups, &$merged): void {
            foreach ($groups as $group) {
                $rows = DB::table('npn')
                    ->where('BOSnetszProductId', $group->BOSnetszProductId)
                    ->orderByDesc('updated_at')
                    ->orderByDesc('id')
                    ->get();

                $keeper = $rows->first();
                $duplicates = $rows->slice(1);
                if (! $keeper || $duplicates->isEmpty()) {
                    continue;
                }

                $duplicateIds = $duplicates->pluck('id')->all();
                $fill = [];
                $keeperValues = get_object_vars($keeper);

                foreach ($rows as $row) {
                    foreach (get_object_vars($row) as $column => $value) {
                        if (in_array($column, ['id', 'created_at', 'updated_at'], true)) {
                            continue;
                        }
                        if (($keeperValues[$column] === null || $keeperValues[$column] === '')
                            && $value !== null
                            && $value !== '') {
                            $fill[$column] = $value;
                        }
                    }
                }

                if ($fill !== []) {
                    DB::table('npn')->where('id', $keeper->id)->update($fill + ['updated_at' => now()]);
                }

                foreach ([['rencana_kirim_items', 'npn_id'], ['sj_validation_items', 'npn_id'], ['standarisasi_tumpukan', 'npn_id']] as [$table, $column]) {
                    if (Schema::hasTable($table) && Schema::hasColumn($table, $column)) {
                        DB::table($table)->whereIn($column, $duplicateIds)->update([$column => $keeper->id]);
                    }
                }

                DB::table('npn')->whereIn('id', $duplicateIds)->delete();
                $merged++;
            }
        });

        $this->info('Selesai. '.$merged.' kode digabungkan. Jalankan migration unique index.');

        return self::SUCCESS;
    }
}
