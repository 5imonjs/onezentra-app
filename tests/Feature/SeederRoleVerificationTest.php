<?php

namespace Tests\Feature;

use App\Models\EmailRecipient;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SeederRoleVerificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_role_slugs_match_level_slugs(): void
    {
        $this->seedRoles();
        $roleSlugs = Role::pluck('slug')->sort()->values()->toArray();
        $levelSlugs = Role::LEVEL_SLUGS;
        sort($levelSlugs);
        $this->assertSame($levelSlugs, $roleSlugs);
    }

    public function test_all_14_roles_have_correct_name_and_description(): void
    {
        $this->seedRoles();
        $expectedMeta = [
            'admin_master' => ['name' => 'Admin Master', 'description' => 'Semua menu + setting'],
            'staff_logistic' => ['name' => 'Staff Logistic', 'description' => 'Input & update data'],
            'rlh' => ['name' => 'RLH', 'description' => 'Approval RLH'],
            'rfah' => ['name' => 'RFAH', 'description' => 'Approval RFAH'],
            'rh' => ['name' => 'RH', 'description' => 'Viewer RH'],
            'blc' => ['name' => 'BLC', 'description' => 'Approval BLC'],
            'bac' => ['name' => 'BAC', 'description' => 'Approval BAC'],
            'admin_distirbusi' => ['name' => 'Admin Distribusi', 'description' => 'Admin Distribusi'],
            'admin_planner' => ['name' => 'Admin Planner', 'description' => 'Admin Planner'],
            'cheker' => ['name' => 'Cheker', 'description' => 'Cheker'],
            'sac' => ['name' => 'SAC', 'description' => 'SAC'],
            'operator' => ['name' => 'Operator', 'description' => 'Operator depot'],
            'ga' => ['name' => 'GA', 'description' => 'Viewer semua modul (view only)'],
            'bh' => ['name' => 'BH', 'description' => 'BH (setara Admin Planner)'],
        ];

        foreach ($expectedMeta as $slug => $meta) {
            $role = Role::where('slug', $slug)->first();
            $this->assertNotNull($role, "Role {$slug} harus ada");
            $this->assertSame($meta['name'], $role->name);
            $this->assertSame($meta['description'], $role->description);
        }
    }

    public function test_user_level_matches_role_slug(): void
    {
        $role = Role::create(['slug' => 'staff_logistic', 'name' => 'Staff Logistic']);
        $user = User::create([
            'email' => 'test@staff.test',
            'password' => 'password',
            'full_name' => 'Staff User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'level' => 'staff_logistic',
            'role_id' => $role->id,
            'status' => 'active',
        ]);
        $this->assertEquals($role->slug, $user->level);
    }

    public function test_email_recipient_role_slugs_are_valid(): void
    {
        $this->seedRoles();
        $validSlugs = Role::LEVEL_SLUGS;

        EmailRecipient::create([
            'document_type' => 'rencana_kirim', 'trigger' => 'created',
            'recipient_type' => 'role', 'field' => 'TO', 'role_slug' => 'blc',
            'email' => 'test@example.com', 'is_active' => true,
        ]);
        EmailRecipient::create([
            'document_type' => 'sj_ba', 'trigger' => 'validated',
            'recipient_type' => 'role', 'field' => 'CC', 'role_slug' => 'admin_distirbusi',
            'email' => 'cc@example.com', 'is_active' => true,
        ]);

        $this->assertContains('blc', $validSlugs);
        $this->assertContains('admin_distirbusi', $validSlugs);
    }

    public function test_approval_view_hanya_untuk_admin_master(): void
    {
        $this->seedRoles();
        $this->seed(PermissionSeeder::class);

        $owners = Role::whereHas('permissions', fn ($query) => $query->where('slug', 'approval.view'))
            ->pluck('slug')
            ->sort()
            ->values()
            ->all();
        $this->assertSame(['admin_master'], $owners);

        $expectations = [
            'blc' => 'approval.submit',
            'bac' => 'approval.check',
            'rlh' => 'approval.approve',
            'rfah' => 'approval.rfah',
        ];
        foreach ($expectations as $roleSlug => $permissionSlug) {
            $this->assertTrue(
                Role::where('slug', $roleSlug)->first()->permissions()->where('slug', $permissionSlug)->exists(),
                "Role {$roleSlug} harus memegang {$permissionSlug}"
            );
        }
    }

    public function test_sac_and_operator_mirror_bac_and_cheker_permissions(): void
    {
        $this->seedRoles();
        $this->seed(PermissionSeeder::class);

        $bac = Role::where('slug', 'bac')->first()->permissions()->pluck('slug')->sort()->values()->all();
        $sac = Role::where('slug', 'sac')->first()->permissions()->pluck('slug')->sort()->values()->all();
        $this->assertNotEmpty($sac, 'Role sac tidak boleh nol permission (lockout)');
        $this->assertSame($bac, $sac);

        $cheker = Role::where('slug', 'cheker')->first()->permissions()->pluck('slug')->sort()->values()->all();
        $operator = Role::where('slug', 'operator')->first()->permissions()->pluck('slug')->sort()->values()->all();
        $this->assertNotEmpty($operator, 'Role operator tidak boleh nol permission (lockout)');

        // operator = cheker KECUALI aksi sensitif (keputusan akses 2026-10-09):
        // operator operasional depo, bukan checker.
        $operatorExcluded = [
            'approval.submit', 'retribusi_rates.manage', 'sj_validation.edit_completed',
            'opname.edit', 'opname.session.edit', 'penerimaan.delete',
        ];
        $expectedOperator = array_values(array_diff($cheker, $operatorExcluded));
        sort($expectedOperator);
        $this->assertSame($expectedOperator, $operator);
        foreach ($operatorExcluded as $slug) {
            $this->assertNotContains($slug, $operator, "operator tidak boleh memegang {$slug}");
        }
    }

    public function test_keputusan_akses_2026_10_09_tertanam_di_seeder(): void
    {
        $this->seedRoles();
        $this->seed(PermissionSeeder::class);

        // Grant live yang disengaja (keputusan akses 2026-10-09) harus tetap
        // ada di seeder supaya `sync()` berikutnya tidak mencabutnya diam-diam.
        $kept = [
            'staff_logistic' => ['depot.view_all'],
            'cheker' => [
                'approval.submit', 'retribusi_rates.manage', 'sj_validation.edit_completed',
                'opname.edit', 'penerimaan.delete',
            ],
            'blc' => [
                'sj_validation.create', 'sj_validation.edit', 'sj_validation.validate', 'sj_validation.complete',
                'standarisasi.create', 'standarisasi.delete', 'standarisasi.export', 'standarisasi.template',
                'cluster_principal.create', 'cluster_principal.delete', 'cluster_principal.edit',
                'biaya_retribusi.delete', 'biaya_retribusi.import', 'biaya_thl.delete', 'biaya_thl.import',
                'opname.create', 'opname.edit', 'rencana_kirim.view', 'retribusi_rates.manage',
            ],
            'admin_planner' => ['gate.view', 'receiving.view', 'sj_validation.view'],
        ];

        foreach ($kept as $roleSlug => $slugs) {
            $held = Role::where('slug', $roleSlug)->first()->permissions()->pluck('slug')->all();
            foreach ($slugs as $slug) {
                $this->assertContains($slug, $held, "Role {$roleSlug} harus memegang {$slug}");
            }
        }

        // approval.view sengaja TIDAK dipertahankan — tetap admin_master-only.
        $this->assertTrue(
            Role::where('slug', 'blc')->first()->permissions()->where('slug', 'approval.view')->doesntExist(),
            'blc tidak boleh memegang approval.view'
        );
    }

    public function test_blc_scoped_global_diganti_permission_standarisasi_lintas_depo(): void
    {
        $this->seedRoles();
        $this->seed(PermissionSeeder::class);

        // `depot.view_all` = saklar lintas-depo GLOBAL. Revisi 2026-10-09:
        // BLC tidak lagi memegangnya supaya tidak melihat semua depo di semua
        // modul + filter depo dashboard. Yang tersisa hanya role yang memang
        // lintas-depo secara menyeluruh (+ GA viewer luas, keputusan 2026-10-09).
        $globalViewAll = Role::whereHas('permissions', fn ($query) => $query->where('slug', 'depot.view_all'))
            ->pluck('slug')->sort()->values()->all();
        $this->assertSame(['admin_master', 'admin_planner', 'bh', 'ga', 'staff_logistic'], $globalViewAll);
        $this->assertFalse(
            Role::where('slug', 'blc')->first()->permissions()->where('slug', 'depot.view_all')->exists(),
            'blc tidak boleh memegang depot.view_all (saklar global)'
        );

        // Gantinya: permission sempit khusus modul standarisasi.
        $standarisasiViewAll = Role::whereHas('permissions', fn ($query) => $query->where('slug', 'standarisasi.view_all'))
            ->pluck('slug')->sort()->values()->all();
        $this->assertSame(['admin_master', 'blc'], $standarisasiViewAll);
    }

    public function test_opname_progress_all_mengikuti_opname_view(): void
    {
        $this->seedRoles();
        $this->seed(PermissionSeeder::class);

        $viewHolders = Role::whereHas('permissions', fn ($query) => $query->where('slug', 'opname.view'))
            ->pluck('slug')
            ->sort()
            ->values()
            ->all();
        $progressHolders = Role::whereHas('permissions', fn ($query) => $query->where('slug', 'opname.progress_all'))
            ->pluck('slug')
            ->sort()
            ->values()
            ->all();

        // Migration grant_opname_progress_all_to_opname_viewers memberi
        // progress_all ke tiap pemegang opname.view; seeder harus konsisten
        // supaya `sync()` tidak mencabutnya diam-diam.
        $this->assertNotEmpty($viewHolders);
        $this->assertSame($viewHolders, $progressHolders);
        $this->assertContains('operator', $progressHolders);
        $this->assertContains('sac', $progressHolders);
        $this->assertContains('ga', $progressHolders);
    }

    public function test_sesi_opname_hanya_untuk_yang_menjalankan_bukan_viewer(): void
    {
        $this->seedRoles();
        $this->seed(PermissionSeeder::class);

        $sessionView = Role::whereHas('permissions', fn ($query) => $query->where('slug', 'opname.session.view'))
            ->pluck('slug')
            ->sort()
            ->values()
            ->all();

        // Sesi opname = fitur lapangan: hanya role yang bisa membuat/verifikasi.
        $this->assertContains('staff_logistic', $sessionView);
        $this->assertContains('cheker', $sessionView);
        $this->assertContains('operator', $sessionView);
        $this->assertContains('admin_planner', $sessionView);

        // Viewer murni (opname.view saja) tidak boleh melihat menu lapangan.
        foreach (['rlh', 'rfah', 'rh', 'bac', 'ga'] as $viewer) {
            $this->assertNotContains($viewer, $sessionView, "role {$viewer} viewer murni tidak boleh melihat sesi opname");
        }

        // Verifikasi mengikuti `opname.edit`: operator (tanpa opname.edit) tidak ikut.
        $sessionEdit = Role::whereHas('permissions', fn ($query) => $query->where('slug', 'opname.session.edit'))
            ->pluck('slug')
            ->values()
            ->all();
        $this->assertContains('cheker', $sessionEdit);
        $this->assertContains('staff_logistic', $sessionEdit);
        $this->assertNotContains('operator', $sessionEdit);
        $this->assertNotContains('admin_planner', $sessionEdit);
    }

    public function test_ga_viewer_luas_dan_bh_mirror_admin_planner(): void
    {
        $this->seedRoles();
        $this->seed(PermissionSeeder::class);

        // GA = viewer luas: semua modul view-only, lintas depo (keputusan
        // akses 2026-10-09). Set eksak dikunci supaya drift langsung terlihat.
        $ga = Role::where('slug', 'ga')->first()->permissions()->pluck('slug')->sort()->values()->all();
        $this->assertNotEmpty($ga, 'Role ga tidak boleh nol permission (lockout)');
        $expectedGa = [
            'dashboard.view', 'depot.view_all',
            'rencana_kirim.view', 'gate.view', 'sj_validation.view', 'receiving.view',
            'penerimaan.view', 'npn.view', 'standar_umur.view', 'standarisasi.view',
            'biaya_thl.view', 'biaya_thl.export',
            'biaya_retribusi.view', 'biaya_retribusi.export',
            'reports.selisih_qty', 'reports.penerimaan', 'reports.penerimaan_batch_expired', 'reports.rencana_kirim', 'reports.biaya_thl', 'reports.biaya_retribusi',
            'opname.view', 'opname.progress_all',
            'cluster_principal.view',
        ];
        sort($expectedGa);
        $this->assertSame($expectedGa, $ga);

        // GA VIEW-ONLY: tidak boleh memegang permission aksi tulis apa pun.
        $writeVerbs = ['create', 'edit', 'delete', 'import', 'submit', 'check', 'approve', 'reject', 'revise', 'rfah', 'validate', 'complete', 'cancel', 'manage', 'full_control'];
        $gaWrite = array_values(array_filter($ga, function (string $slug) use ($writeVerbs): bool {
            $verb = explode('.', $slug)[1] ?? '';

            return in_array($verb, $writeVerbs, true);
        }));
        $this->assertSame([], $gaWrite, 'ga harus view-only, tidak boleh ada permission tulis');

        // BH = mirror penuh permission Admin Planner.
        $adminPlanner = Role::where('slug', 'admin_planner')->first()->permissions()->pluck('slug')->sort()->values()->all();
        $bh = Role::where('slug', 'bh')->first()->permissions()->pluck('slug')->sort()->values()->all();
        $this->assertNotEmpty($bh, 'Role bh tidak boleh nol permission (lockout)');
        $this->assertSame($adminPlanner, $bh);

        // Total sistem tetap konsisten: 12 role lama + ga + bh, 102 permission
        // (99 lama + 3 sesi opname), dan grant hasil turunan.
        $this->assertSame(14, Role::count());
        $this->assertSame(106, Permission::count());
        $this->assertSame(568, DB::table('role_permission')->count());
    }

    private function seedRoles(): void
    {
        $meta = [
            'admin_master' => ['name' => 'Admin Master', 'description' => 'Semua menu + setting'],
            'staff_logistic' => ['name' => 'Staff Logistic', 'description' => 'Input & update data'],
            'rlh' => ['name' => 'RLH', 'description' => 'Approval RLH'],
            'rfah' => ['name' => 'RFAH', 'description' => 'Approval RFAH'],
            'rh' => ['name' => 'RH', 'description' => 'Viewer RH'],
            'blc' => ['name' => 'BLC', 'description' => 'Approval BLC'],
            'bac' => ['name' => 'BAC', 'description' => 'Approval BAC'],
            'admin_distirbusi' => ['name' => 'Admin Distribusi', 'description' => 'Admin Distribusi'],
            'admin_planner' => ['name' => 'Admin Planner', 'description' => 'Admin Planner'],
            'cheker' => ['name' => 'Cheker', 'description' => 'Cheker'],
            'sac' => ['name' => 'SAC', 'description' => 'SAC'],
            'operator' => ['name' => 'Operator', 'description' => 'Operator depot'],
            'ga' => ['name' => 'GA', 'description' => 'Viewer semua modul (view only)'],
            'bh' => ['name' => 'BH', 'description' => 'BH (setara Admin Planner)'],
        ];
        foreach ($meta as $slug => $data) {
            Role::firstOrCreate(['slug' => $slug], $data);
        }
    }
}
