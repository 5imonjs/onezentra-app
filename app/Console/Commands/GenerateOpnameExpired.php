<?php

namespace App\Console\Commands;

use App\Services\OpnameExpiredService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Generate wave opname expired minggu berjalan tanpa menunggu klik manual:
 * tanpa ini, satu minggu yang lolos generate membuat rantai roll-forward
 * terputus (stok minggu lalu tidak terbawa ke snapshot minggu berikutnya).
 */
class GenerateOpnameExpired extends Command
{
    protected $signature = 'opname-expired:generate {--week= : Minggu week_start (Y-m-d), default hari ini}';

    protected $description = 'Generate wave opname expired minggu berjalan';

    public function handle(OpnameExpiredService $service): int
    {
        $week = $this->option('week')
            ? Carbon::parse($this->option('week'))
            : Carbon::today();

        $result = $service->generate($week, null);

        $this->info('Opname expired minggu '.$result['week_start'].' s/d '.$result['week_end'].' berhasil digenerate ('.$result['batches'].' wave).');

        return self::SUCCESS;
    }
}
