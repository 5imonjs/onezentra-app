<?php

namespace Tests\Feature;

use App\Models\EmailRecipient;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    public function test_all_12_roles_have_correct_name_and_description(): void
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
        ];
        foreach ($meta as $slug => $data) {
            Role::firstOrCreate(['slug' => $slug], $data);
        }
    }
}
