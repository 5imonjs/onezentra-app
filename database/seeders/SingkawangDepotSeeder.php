<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class SingkawangDepotSeeder extends Seeder
{
    /**
     * Satu user per role untuk Depo 0127/Singkawang.
     * Idempoten via updateOrCreate berdasarkan email.
     */
    public function run(): void
    {
        $users = [
            ['level' => 'admin_master', 'full_name' => 'Admin Master Singkawang'],
            ['level' => 'staff_logistic', 'full_name' => 'Staff Logistic Singkawang'],
            ['level' => 'rlh', 'full_name' => 'RLH Singkawang'],
            ['level' => 'rfah', 'full_name' => 'RFAH Singkawang'],
            ['level' => 'rh', 'full_name' => 'RH Singkawang'],
            ['level' => 'blc', 'full_name' => 'BLC Singkawang'],
            ['level' => 'bac', 'full_name' => 'BAC Singkawang'],
            ['level' => 'admin_distirbusi', 'full_name' => 'Admin Distribusi Singkawang'],
            ['level' => 'admin_planner', 'full_name' => 'Admin Planner Singkawang'],
            ['level' => 'cheker', 'full_name' => 'Cheker Singkawang'],
        ];

        foreach ($users as $data) {
            $role = Role::where('slug', $data['level'])->first();

            $user = User::updateOrCreate(
                ['email' => $data['level'].'.singkawang@onezentra.com'],
                [
                    'kode_depo' => '0127',
                    'nama_depo' => 'Singkawang',
                    'full_name' => $data['full_name'],
                    'password' => Hash::make('password'),
                    'level' => $data['level'],
                    'status' => 'active',
                ]
            );

            if ($role) {
                $user->roles()->sync([$role->id]);
            }
        }

        $this->command->info('Singkawang depot users seeded successfully.');
    }
}
