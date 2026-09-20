<?php

namespace App\Console\Commands;

use App\Models\Npn;
use Illuminate\Console\Command;

class BackfillNpnDepo extends Command
{
    protected $signature = 'npn:backfill-depo {--dry-run : Preview changes without updating database}';

    protected $description = 'Backfill kode_depo and nama_depo on NPN records that have NULL values, using the creator user depo info';

    public function handle(): int
    {
        $dryRun = $this->option('dry-run');

        $total = Npn::whereNull('kode_depo')->count();

        if ($total === 0) {
            $this->info('All NPN records already have kode_depo set. Nothing to do.');

            return self::SUCCESS;
        }

        $this->info("Found {$total} NPN records with NULL kode_depo.");

        if ($dryRun) {
            $this->newLine();
            $this->info('DRY RUN — showing what would be updated:');
            $this->newLine();
        }

        $updated = 0;
        $skipped = 0;

        Npn::whereNull('kode_depo')
            ->with('creator')
            ->chunk(200, function ($records) use (&$updated, &$skipped, $dryRun) {
                foreach ($records as $npn) {
                    $user = $npn->creator;

                    if (! $user || blank($user->kode_depo)) {
                        $skipped++;

                        if ($dryRun) {
                            $this->line("  <comment>SKIP</comment> NPN #{$npn->id} — creator user not found or has no depo");
                        }

                        continue;
                    }

                    if ($dryRun) {
                        $nickname = $npn->szNickName ?? '-';
                        $this->line("  <info>UPDATE</info> NPN #{$npn->id} ({$nickname}) → kode_depo: {$user->kode_depo}, nama_depo: {$user->nama_depo}");
                    } else {
                        $npn->update([
                            'kode_depo' => $user->kode_depo,
                            'nama_depo' => $user->nama_depo,
                        ]);
                    }

                    $updated++;
                }
            });

        $this->newLine();

        if ($dryRun) {
            $this->info("DRY RUN complete. Would update: {$updated}, skip: {$skipped}");
        } else {
            $this->info("Backfill complete. Updated: {$updated}, skipped: {$skipped}");
        }

        return self::SUCCESS;
    }
}
