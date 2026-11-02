<?php

namespace App\Console\Commands;

use App\Models\ClusterPrincipal;
use App\Models\Npn;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use RuntimeException;
use Throwable;

/**
 * Menyiapkan fixtures + token untuk `tests/load/api-load.mjs`.
 *
 * Sengaja memakai connection normal, BUKAN RefreshDatabase: token load test
 * harus tetap hidup di database dev selama server berjalan.
 */
class PrepareLoadTest extends Command
{
    protected $signature = 'loadtest:prepare
        {--users=20 : jumlah token yang diterbitkan}
        {--rows=5000 : jumlah baris master yang di-seed}';

    protected $description = 'Siapkan user, token, dan data dummy untuk load test API';

    public function handle(): int
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->components->error('Load test hanya boleh dijalankan di environment local atau testing.');

            return self::FAILURE;
        }

        $userCount = (int) $this->option('users');
        $rows = (int) $this->option('rows');

        if ($userCount < 1 || $rows < 1) {
            $this->components->error('Jumlah users dan rows harus lebih besar dari nol.');

            return self::FAILURE;
        }

        $tokenFile = tempnam(sys_get_temp_dir(), 'onezentra-loadtest-');
        if ($tokenFile === false) {
            $this->components->error('Tidak dapat membuat file token sementara.');

            return self::FAILURE;
        }

        $permissions = fileperms($tokenFile);
        $tokenDirectory = realpath(dirname($tokenFile));
        $temporaryDirectory = realpath(sys_get_temp_dir());
        if (
            $permissions === false
            || ($permissions & 0077) !== 0
            || $tokenDirectory === false
            || $tokenDirectory !== $temporaryDirectory
        ) {
            if (! unlink($tokenFile)) {
                throw new RuntimeException('Tidak dapat menghapus file token sementara yang tidak aman.');
            }

            $this->components->error('File token sementara tidak memiliki permission yang aman.');

            return self::FAILURE;
        }

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
        try {
            DB::transaction(function () use ($userCount, $role, $tokenFile, &$tokens): void {
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

                $tokenContents = implode(',', $tokens);
                if (file_put_contents($tokenFile, $tokenContents, LOCK_EX) !== strlen($tokenContents)) {
                    throw new RuntimeException('Tidak dapat menulis token ke file sementara.');
                }
            });
        } catch (Throwable $exception) {
            if (is_file($tokenFile) && ! unlink($tokenFile)) {
                throw new RuntimeException('Tidak dapat menghapus file token setelah persiapan gagal.', previous: $exception);
            }

            throw $exception;
        }

        $this->newLine();
        $this->components->info('Selesai.');
        $this->line('  cluster_principal : '.ClusterPrincipal::count().' baris');
        $this->line('  npn               : '.Npn::count().' baris');
        $this->line('  tokens            : '.count($tokens));
        $this->newLine();
        $this->line('File token sementara: '.$tokenFile);
        $this->line('Jalankan: node tests/load/api-load.mjs --tokens-file='.escapeshellarg($tokenFile));

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
        if (Npn::count() >= $rows) {
            return;
        }

        foreach (array_chunk(range(1, $rows), 500) as $chunk) {
            $now = now();
            $model = new Npn;
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
