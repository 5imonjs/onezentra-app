<?php

namespace Tests\Feature;

use App\Models\ClusterPrincipal;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Test yang rallied sebagai harness load test.
 *
 * Fungsinya bukan menguji endpoint, tapi menyediakan token + data yang bisa
 * dipakai `tests/load/api-load.mjs`. Dipisah dari test biasa karena harus
 * jalan dengan APP_ENV lokal dan database dev, bukan saat `php artisan test`.
 */
class LoadTestHarnessTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Menyiapkan N user dengan token valid, lalu mencetak tokennya.
     *
     * Dipakai manual: php artisan test --filter=LoadTestHarnessTest
     * Output di-row terakhir adalah daftar token untuk --tokens.
     */
    public function test_issue_tokens_for_load_test(): void
    {
        $role = Role::firstOrCreate(['slug' => 'admin_master'], ['name' => 'admin_master', 'slug' => 'admin_master']);
        foreach (['cluster_principal.view', 'npn.view', 'dashboard.view', 'receiving.view', 'rencana_kirim.view'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug]);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        // Data cukup agar endpoint tidak jalan di tabel kosong — query pada
        // tabel kosong tidak mewakili beban produksi sama sekali.
        ClusterPrincipal::insert(array_map(fn ($i) => [
            'lob' => $i % 3 === 0 ? 'DAIRY & DAIRY' : ($i % 3 === 1 ? 'Food' : 'Beverage'),
            'product_category' => 'Cat'.$i,
            'product_sku' => sprintf('SKU-%06d', $i),
            'principal_1' => 'P'.($i % 40),
            'created_at' => now(),
            'updated_at' => now(),
        ], range(1, 5000)));

        $tokens = [];
        for ($i = 0; $i < 20; $i++) {
            $user = User::create([
                'email' => "load{$i}@example.com",
                'password' => 'password',
                'full_name' => "Load User {$i}",
                'kode_depo' => 'DPO',
                'nama_depo' => 'Depo',
                'level' => 'admin_master',
                'status' => 'active',
            ]);
            $role->users()->attach($user->id);
            $tokens[] = $user->createToken('loadtest')->plainTextToken;
        }

        fwrite(STDERR, "\n=== LOADTEST_TOKENS ===\n".implode(',', $tokens)."\n=== END ===\n");
        fwrite(STDERR, 'cluster_principal rows: '.ClusterPrincipal::count().PHP_EOL);

        $this->assertCount(20, $tokens);
        $this->assertSame(5000, ClusterPrincipal::count());
    }

    /** Sanity: token yang diterbitkan benar-benar bisa dipakai. */
    public function test_issued_token_authenticates(): void
    {
        $user = User::create([
            'email' => 'tok@example.com', 'password' => 'password',
            'full_name' => 'Tok', 'kode_depo' => 'DPO',
            'nama_depo' => 'Depo', 'level' => 'staff_logistic', 'status' => 'active',
        ]);
        $role = Role::firstOrCreate(['slug' => 'staff_logistic'], ['name' => 'staff_logistic', 'slug' => 'staff_logistic']);
        $perm = Permission::firstOrCreate(['slug' => 'cluster_principal.view'], ['name' => 'cluster_principal.view']);
        $role->permissions()->syncWithoutDetaching([$perm->id]);
        $role->users()->attach($user->id);

        $token = $user->fresh()->createToken('t')->plainTextToken;

        Sanctum::actingAs($user->fresh());

        $this->getJson('/api/v1/cluster-principal')->assertOk();
        $this->assertNotEmpty($token);
    }
}
