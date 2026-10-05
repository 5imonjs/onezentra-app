<?php

namespace App\Console\Commands;

use App\Models\ClusterPrincipal;
use Illuminate\Console\Command;

/**
 * Isi bosnetsz_product_id/sap_product_id untuk baris cluster_principal
 * yang dibuat sebelum kolom kunci stabil ada.
 *
 * Update-only, restartable: baris yang sudah punya ID dilewati, baris yang
 * SKU-nya tidak dikenal NPN tetap NULL (laporan jatuh ke fallback
 * standar_umur_produk.principal). Resolusi memakai aturan yang sama dengan
 * ClusterPrincipal::resolveStableIds, lewat saving-hook model.
 */
class BackfillClusterPrincipalStableIds extends Command
{
    protected $signature = 'cluster-principal:backfill-stable-ids';

    protected $description = 'Isi ID stabil NPN untuk baris cluster_principal lama';

    public function handle(): int
    {
        $touched = 0;
        $resolved = 0;
        $unmatched = 0;

        ClusterPrincipal::query()
            ->whereNull('bosnetsz_product_id')
            ->whereNotNull('product_sku')
            ->chunkById(200, function ($rows) use (&$touched, &$resolved, &$unmatched): void {
                foreach ($rows as $row) {
                    $row->refreshStableIds();
                    $row->save();
                    $touched++;

                    if ($row->bosnetsz_product_id !== null) {
                        $resolved++;
                    } else {
                        $unmatched++;
                    }
                }
            });

        $this->components->info('Selesai.');
        $this->line("  diproses     : {$touched}");
        $this->line("  terpetakan   : {$resolved}");
        $this->line("  tanpa padanan: {$unmatched}");

        return self::SUCCESS;
    }
}
