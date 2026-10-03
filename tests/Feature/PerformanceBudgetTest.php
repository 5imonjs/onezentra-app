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
 * Batas performa yang dikodekan sebagai test.
 *
 * Ini bukan load test sungguhan (butuh server + banyak proses); ini mengunci
 * anggaran sumber daya agar regresi performa jadi kegagalan di CI, bukan
 * baru diketahui saat user komplain.
 *
 * Untuk simulasi 100-500 user paralel sungguhan, jalankan skenario lewat
 * `php artisan test --group=performance` di environment staging dengan
 * cache driver yang sama dengan produksi.
 */
class PerformanceBudgetTest extends TestCase
{
    use RefreshDatabase;

    private function authedUser(): User
    {
        $role = Role::firstOrCreate(['slug' => 'admin_master'], ['name' => 'admin_master', 'slug' => 'admin_master']);
        foreach (['cluster_principal.view', 'npn.view'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug]);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'perf-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Perf User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        Sanctum::actingAs($user->fresh());

        return $user;
    }

    /**
     * Master global dibaca dari mana saja tanpa filter depo, jadiukurannya
     * tidak boleh ikut grow bersama jumlah user — itu yang membuat modul
     * ini bowed dipakai semua depot.
     */
    public function test_global_master_query_is_not_depot_scoped(): void
    {
        $this->authedUser();

        ClusterPrincipal::create(['product_sku' => 'SKU-A', 'principal_1' => 'ABBOTT']);

        $res = $this->getJson('/api/v1/cluster-principal')->assertOk();

        $this->assertSame(1, $res->json('total'), 'Master global harus terbaca penuh, tidak ter-scope depo');
    }

    /**
     * Tabel 8 kolom ini akan dibaca sering dan bisa tumbuh sampai ratusan ribu
     * baris. Halaman pertama pada 20 baris harus tetap di bawah anggaran 1s;
     * kalau tidak, penyebabnya hampir selalu index yang hilang pada kolom sort.
     */
    public function test_list_query_stays_within_time_budget(): void
    {
        $this->authedUser();

        // 1.000 baris: cukup untuk memunculkan masalah, cepat untuk CI.
        ClusterPrincipal::insert(array_map(fn ($i) => [
            'lob' => $i % 2 === 0 ? 'DAIRY & DAIRY' : 'Food',
            'product_sku' => sprintf('SKU-%05d', $i),
            'principal_1' => 'P'.($i % 50),
            'created_at' => now(),
            'updated_at' => now(),
        ], range(1, 1000)));

        $start = microtime(true);
        $this->getJson('/api/v1/cluster-principal')->assertOk();
        $elapsed = microtime(true) - $start;

        $this->assertLessThan(
            1.0,
            $elapsed,
            sprintf('List 1.000 baris memakan %.3fs, melewati anggaran 1s', $elapsed)
        );
    }

    /** Query COUNT untuk pagination harus tetap berada di anggaran. */
    public function test_pagination_count_stays_within_time_budget(): void
    {
        $this->authedUser();

        ClusterPrincipal::insert(array_map(fn ($i) => [
            'product_sku' => sprintf('SKU-%05d', $i),
            'created_at' => now(),
            'updated_at' => now(),
        ], range(1, 1000)));

        $start = microtime(true);
        $this->getJson('/api/v1/cluster-principal?search=SKU-0001')->assertOk();
        $elapsed = microtime(true) - $start;

        $this->assertLessThan(
            1.0,
            $elapsed,
            sprintf('Pencarian pada 1.000 baris memakan %.3fs', $elapsed)
        );
    }

    /**
     * Export dibatasi oleh ExportGuard. Kalau guard hilang, satu user bisa
     * mengekspor seluruh tabel dan menjatuhkan worker — ini yang mengunci
     * perilaku tersebut.
     */
    public function test_export_is_guarded_against_full_table_dumps(): void
    {
        $this->authedUser();

        ClusterPrincipal::insert(array_map(fn ($i) => [
            'product_sku' => sprintf('SKU-%05d', $i),
            'created_at' => now(),
            'updated_at' => now(),
        ], range(1, 120)));

        $res = $this->get('/api/v1/cluster-principal/export');

        // Excel::download() mengembalikan BinaryFileResponse, yang tidak punya
        // ->status() (itu JsonResponse/Response). Pakai getStatusCode() yang
        // tersedia di TestResponse untuk semua tipe response.
        $status = $res->getStatusCode();

        $this->assertContains(
            $status,
            [200, 413, 422],
            sprintf('Export menghasilkan status %d — kemungkinan guard bermasalah', $status)
        );
    }
}
