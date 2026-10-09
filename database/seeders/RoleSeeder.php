<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
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

        foreach (Role::LEVEL_SLUGS as $slug) {
            $role = $meta[$slug] ?? ['name' => $slug, 'description' => ''];
            Role::updateOrCreate(['slug' => $slug], [
                'name' => $role['name'],
                'description' => $role['description'],
            ]);
        }

        $this->command->info('Roles seeded successfully.');
    }
}
