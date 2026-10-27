<?php

require __DIR__.'/../vendor/autoload.php';

$app = require __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();

use App\Models\Batch;
use App\Models\SjValidationItem;
use Illuminate\Contracts\Console\Kernel;

$items = SjValidationItem::where('status', 'VALIDATED') // atau kondisi validasi
    ->whereDoesntHave('batch')
    ->get();

$created = 0;
foreach ($items as $item) {
    try {
        Batch::createWithRetry([
            'sj_validation_item_id' => $item->id,
            'items_json' => [[
                'kode_barang' => $item->kode_barang,
                'nama_barang' => $item->nama_barang,
                'actual_qty' => (float) $item->actual_qty,
                'satuan' => $item->satuan,
                'barcode' => $item->barcode,
                'condition' => $item->condition,
                'source' => 'SJ',
                'origin' => 'sj_validation',
            ]],
            'status' => 'ACTIVE',
        ], 3, 'SJ-');
        $created++;
        echo "Created batch for item {$item->id}\n";
    } catch (Exception $e) {
        echo "Failed item {$item->id}: {$e->getMessage()}\n";
    }
}
echo "Total created: $created\n";
