<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $users = [
            [
                'kode_depo' => 'ADMIN',
                'nama_depo' => 'Admin Utama',
                'full_name' => 'Admin Utama',
                'email' => 'admin@onezentra.com',
                'level' => 'admin_master',
                'role_slug' => 'admin_master',
            ],
            [
                'kode_depo' => 'STAFF-01',
                'nama_depo' => 'Depo Staff Logistic',
                'full_name' => 'Staff Logistik',
                'email' => 'stafflogistic@onezentra.com',
                'level' => 'staff_logistic',
                'role_slug' => 'staff_logistic',
            ],
            [
                'kode_depo' => 'RLH-01',
                'nama_depo' => 'Depo RLH',
                'full_name' => 'User RLH',
                'email' => 'rlh@onezentra.com',
                'level' => 'rlh',
                'role_slug' => 'rlh',
            ],
            [
                'kode_depo' => 'RFAH-01',
                'nama_depo' => 'Depo RFAH',
                'full_name' => 'User RFAH',
                'email' => 'rfah@onezentra.com',
                'level' => 'rfah',
                'role_slug' => 'rfah',
            ],
            [
                'kode_depo' => 'RH-01',
                'nama_depo' => 'Depo RH',
                'full_name' => 'User RH',
                'email' => 'rh@onezentra.com',
                'level' => 'rh',
                'role_slug' => 'rh',
            ],
            [
                'kode_depo' => 'BLC-01',
                'nama_depo' => 'Depo BLC',
                'full_name' => 'User BLC',
                'email' => 'blc@onezentra.com',
                'level' => 'blc',
                'role_slug' => 'blc',
            ],
            [
                'kode_depo' => 'BAC-01',
                'nama_depo' => 'Depo BAC',
                'full_name' => 'User BAC',
                'email' => 'bac@onezentra.com',
                'level' => 'bac',
                'role_slug' => 'bac',
            ],
            [
                'kode_depo' => 'DIST-01',
                'nama_depo' => 'Depo Distribusi',
                'full_name' => 'Admin Distribusi',
                'email' => 'admindistribusi@onezentra.com',
                'level' => 'admin_distirbusi',
                'role_slug' => 'admin_distirbusi',
            ],
            [
                'kode_depo' => 'PLAN-01',
                'nama_depo' => 'Depo Planner',
                'full_name' => 'Admin Planner',
                'email' => 'adminplanner@onezentra.com',
                'level' => 'admin_planner',
                'role_slug' => 'admin_planner',
            ],
            [
                'kode_depo' => 'CHEK-01',
                'nama_depo' => 'Depo Cheker',
                'full_name' => 'User Cheker',
                'email' => 'cheker@onezentra.com',
                'level' => 'cheker',
                'role_slug' => 'cheker',
            ],
            [
                'kode_depo' => 'SAC-01',
                'nama_depo' => 'Depo SAC',
                'full_name' => 'User SAC',
                'email' => 'sac@onezentra.com',
                'level' => 'sac',
                'role_slug' => 'sac',
            ],
        ];

        foreach ($users as $data) {
            $role = Role::where('slug', $data['role_slug'])->first();

            $user = User::updateOrCreate(
                ['email' => $data['email']],
                [
                    'kode_depo' => $data['kode_depo'],
                    'nama_depo' => $data['nama_depo'],
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

        $this->command->info('Users seeded successfully.');
    }
}
