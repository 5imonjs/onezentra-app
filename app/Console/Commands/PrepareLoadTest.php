<?php

namespace App\Console\Commands;

use App\Models\ClusterPrincipal;
use App\Models\NpN;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Menyiapkan fixtures + token untuk `tests/load/api-load.mjs`.
 *
 * Sengaja memakai connection normal, BUKAN RefreshDatabase: token load test
 * harus tetap hidup di database dev selama server berjalan. Command ini juga
 * mencetak token ke stdout supaya bisa langsung di-pipe ke --tokens.
 */
class PrepareLoadTest extends Command
{
    protected $signature = 'loadtest:prepare
        {--users=20 : jumlah token yang diterbitkan}
        {--rows=5000 : jumlah baris master yang di-seed}';

    protected $description = 'Siapkan user, token, dan data dummy untuk load test API';

    public function handle(): int
    {
        $userCount = (int) $this->option('users');
        $rows = (int) $this->option('rows');

        $this->components->info("Menyiapkan {$userCount} token dan {$rows} baris data dummy...");

        $role = Role::firstOrCreate(
            ['slug' => 'admin_master'],
            ['name' => 'Admin Master', 'slug' => 'admin_master']
        );

        foreach ([
            'cluster_principal.view', 'npn.view', 'dashboard.view',
            'receiving.view', 'rencana_kirim.view',
        ] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Loadtest']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->seedClusterPrincipal($rows);
        $this->seedNpn($rows);

        $tokens = [];
        for ($i = 0; $i < $userCount; $i++) {
            $user = User::updateOrCreate(
                ['email' => "loadtest{$i}@local.test"],
                [
                    'password' => Hash::make('loadtest123'),
                    'full_name' => "Load Test {$i}",
                    'kode_depo' => 'LOADTEST',
                    'nama_depo' => 'Load Test Depo',
                    'level' => 'admin_master',
                    'status' => 'active',
                ]
            );
            $role->users()->syncWithoutDetaching([$user->id]);
            $tokens[] = $user->createToken('loadtest')->plainTextToken;
        }

        $this->newLine();
        $this->components->info('Selesai.');
        $this->line('  cluster_principal : '.ClusterPrincipal::count().' baris');
        $this->line('  npn               : '.NpN::count().' baris');
        $this->line('  tokens            : '.count($tokens));
        $this->newLine();
        $this->line('<fg=cyan>Jalankan load test dengan:</>');
        $this->line('  node tests/load/api-load.mjs --users=100 --duration=30 \\');
        $this->line('    --tokens='.substr(implode(',', $tokens), 0, 60).'...');
        $this->newLine();
        $this->line('<fg=yellow>Token lengkap:</>');
        $this->line(implode(',', $tokens));

        return self::SUCCESS;
    }

    private function seedClusterPrincipal(int $rows): void
    {
        $existing = ClusterPrincipal::count();
        if ($existing >= $rows) {
            return;
        }

        // Sisipkan per chunk supaya tidak menabrak batas ukuran packet MySQL
        // pada angka 5.000 baris.
        foreach (array_chunk(range(1, $rows), 500) as $chunk) {
            $now = now();
            DB::table('cluster_principal')->insert(array_map(fn ($i) => [
                'lob' => ['DAIRY & DAIRY', 'Food', 'Beverage'][$i % 3],
                'product_category' => 'Category '.$i,
                'sub_product_category' => 'Sub '.$i,
                'product_group' => 'Group '.$i,
                'product_class' => 'Class '.$i,
                'product_sku' => sprintf('SKU-%06d', $i),
                'principal_1' => 'PRINCIPAL-'.($i % 40),
                'principal_2' => $i % 7 === 0 ? 'SECOND-'.($i % 15) : null,
                'created_at' => $now,
                'updated_at' => $now,
            ], $chunk));
        }
    }

    private function seedNpn(int $rows): void
    {
        if (NpN::count() >= $rows) {
            return;
        }

        foreach (array_chunk(range(1, $rows), 500) as $chunk) {
            $now = now();
            $model = new NpN;
            $model->getConnection()->table($model->getTable())->insert(array_map(fn ($i) => [
                'szNickName' => sprintf('PROD-%05d', $i),
                'szNickNameNew' => 'Product Name '.$i,
                'BOSnetszProductId' => sprintf('BOS%05d', $i),
                'SAPszProductId' => sprintf('SAP%05d', $i),
                'szBarcode' => sprintf('899%08d', $i),
                'szStatus' => 'A',
                'created_at' => $now,
                'updated_at' => $now,
            ], $chunk));
        }
    }
}
