<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\SjValidation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Kontrak: chip statistik Validasi Dokumen mengikuti filter depo —
 * master melihat per depo via filter, user scoped terkunci ke depo sendiri.
 * Kode_depo asing dari user scoped wajib diabaikan, bukan membocorkan
 * hitungan depo lain.
 */
class SjValidationDepotFilterTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(bool $viewAll, string $depo = 'DPO-A'): User
    {
        $role = Role::firstOrCreate(
            ['slug' => 'sj_depot_'.($viewAll ? 'all' : 'scoped').'_'.$depo],
            ['name' => 'SJ Depot']
        );
        $slugs = ['sj_validation.view'];
        if ($viewAll) {
            $slugs[] = 'depot.view_all';
        }
        foreach ($slugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Validasi Dokumen']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'sj-depot-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'SJ Depot User',
            'kode_depo' => $depo,
            'nama_depo' => 'Depo '.$depo,
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function makeValidation(string $kodeDepo, User $creator, string $status): void
    {
        $rk = RencanaKirim::create([
            'po_transporter' => 'PO-SJ-'.uniqid(),
            'status' => 'CHECKED_IN',
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'created_by' => $creator->id,
        ]);
        SjValidation::create([
            'rencana_kirim_id' => $rk->id,
            'validated_by' => $creator->id,
            'scan_code' => $rk->po_transporter,
            'status' => $status,
            'started_at' => now(),
        ]);
    }

    public function test_master_filters_stats_by_depo(): void
    {
        $master = $this->userWith(true);
        $this->makeValidation('DPO-A', $master, 'COMPLETED');
        $this->makeValidation('DPO-B', $master, 'IN_PROGRESS');

        Sanctum::actingAs($master);

        $this->getJson('/api/v1/sj-validations/stats')->assertOk()->assertJsonPath('data.total', 2);
        $this->getJson('/api/v1/sj-validations/stats?kode_depo=DPO-A')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.completed', 1)
            ->assertJsonPath('data.in_progress', 0);
        $this->getJson('/api/v1/sj-validations/stats?kode_depo=DPO-B')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.in_progress', 1)
            ->assertJsonPath('data.completed', 0);
    }

    public function test_scoped_user_passing_foreign_depo_still_sees_own_depo(): void
    {
        $master = $this->userWith(true);
        $this->makeValidation('DPO-A', $master, 'COMPLETED');
        $this->makeValidation('DPO-B', $master, 'IN_PROGRESS');

        Sanctum::actingAs($this->userWith(false, 'DPO-A'));

        $this->getJson('/api/v1/sj-validations/stats')->assertOk()->assertJsonPath('data.total', 1);
        // Filter ke depo lain diabaikan — tetap hitungan depo sendiri.
        $this->getJson('/api/v1/sj-validations/stats?kode_depo=DPO-B')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.completed', 1)
            ->assertJsonPath('data.in_progress', 0);
    }
}
