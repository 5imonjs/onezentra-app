<?php

namespace App\Console\Commands;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

#[Signature('npn:duplicates')]
#[Description('Laporkan BOSnetszProductId yang punya lebih dari satu baris NPN')]
class NpnDuplicateReport extends Command
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
            $this->info('Tidak ada BOSnetszProductId duplikat.');

            return self::SUCCESS;
        }

        $rows = [];
        foreach ($groups as $group) {
            $ids = DB::table('npn')
                ->where('BOSnetszProductId', $group->BOSnetszProductId)
                ->orderBy('id')
                ->pluck('id')
                ->implode(', ');

            $rows[] = [$group->BOSnetszProductId, $group->aggregate, $ids];
        }

        $this->warn('Ditemukan '.$groups->count().' BOSnetszProductId duplikat. Bersihkan sebelum migration unique index.');
        $this->table(['BOSnetszProductId', 'Baris', 'ID'], $rows);
        $this->line('Jalankan `php artisan npn:deduplicate --apply --confirm="DEDUPLICATE NPN"` setelah backup.');

        return self::FAILURE;
    }
}
