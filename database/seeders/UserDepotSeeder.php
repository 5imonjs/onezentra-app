<?php

namespace Database\Seeders;

use App\Models\DepotSetting;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class UserDepotSeeder extends Seeder
{
    /**
     * Assign depots to users via user_depots pivot table.
     * Region managers get all depots in their region.
     * Depot users get only their specific depot.
     */
    public function run(): void
    {
        // Clear existing assignments
        \DB::table('user_depots')->truncate();

        // Region Managers (admin_planner / bh level) - manage all depots in their region
        $regionManagers = [
            [
                'email' => 'region001@onezentra.com',
                'level' => 'admin_planner',
                'full_name' => 'Region 001 Manager',
                'region_id' => 'REG-001',
            ],
            [
                'email' => 'region002@onezentra.com',
                'level' => 'admin_planner',
                'full_name' => 'Region 002 Manager',
                'region_id' => 'REG-002',
            ],
        ];

        foreach ($regionManagers as $mgr) {
            $user = User::where('email', $mgr['email'])->first();
            if (! $user) {
                $role = Role::where('slug', $mgr['level'])->first();
                $user = User::create([
                    'email' => $mgr['email'],
                    'password' => bcrypt('password'),
                    'full_name' => $mgr['full_name'],
                    'kode_depo' => '', // legacy, not used for scoping
                    'nama_depo' => '',
                    'level' => $mgr['level'],
                    'status' => 'active',
                ]);
                if ($role) {
                    $user->roles()->attach($role);
                }
            }

            // Assign all depots in the region
            $depotCodes = DepotSetting::where('region_id', $mgr['region_id'])
                ->where('is_active', true)
                ->pluck('kode_depo')
                ->toArray();

            foreach ($depotCodes as $kodeDepo) {
                \DB::table('user_depots')->insert([
                    'user_id' => $user->id,
                    'kode_depo' => $kodeDepo,
                    'assigned_at' => now(),
                ]);
            }

            $this->command->info("Assigned {$user->email} to depots: ".implode(', ', $depotCodes));
        }

        // Depot-level users (cheker, staff_logistic) - single depot each
        $depotUsers = [
            ['email' => 'depo0126@onezentra.com', 'kode_depo' => '0126', 'level' => 'cheker'],
            ['email' => 'depo0127@onezentra.com', 'kode_depo' => '0127', 'level' => 'staff_logistic'],
            ['email' => 'depo0201@onezentra.com', 'kode_depo' => '0201', 'level' => 'cheker'],
            ['email' => 'depo0202@onezentra.com', 'kode_depo' => '0202', 'level' => 'staff_logistic'],
        ];

        foreach ($depotUsers as $du) {
            $user = User::where('email', $du['email'])->first();
            if (! $user) {
                $role = Role::where('slug', $du['level'])->first();
                $user = User::create([
                    'email' => $du['email'],
                    'password' => bcrypt('password'),
                    'full_name' => 'User '.$du['kode_depo'],
                    'kode_depo' => $du['kode_depo'], // legacy fallback
                    'nama_depo' => DepotSetting::where('kode_depo', $du['kode_depo'])->value('nama_depo') ?? '',
                    'level' => $du['level'],
                    'status' => 'active',
                ]);
                if ($role) {
                    $user->roles()->attach($role);
                }
            }

            \DB::table('user_depots')->insert([
                'user_id' => $user->id,
                'kode_depo' => $du['kode_depo'],
                'assigned_at' => now(),
            ]);

            $this->command->info("Assigned {$user->email} to depot: {$du['kode_depo']}");
        }

        $this->command->info('User depots seeded successfully.');
    }
}
