<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Models\UserActivityLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardActivityTest extends TestCase
{
    use RefreshDatabase;

    public function test_activity_returns_daily_system_usage(): void
    {
        $permission = Permission::create([
            'name' => 'Dashboard View',
            'slug' => 'dashboard.view',
            'menu_group' => 'Test',
        ]);
        $activityPermission = Permission::firstOrCreate(
            ['slug' => 'activity.view'],
            ['name' => 'Lihat Log Aktivitas', 'menu_group' => 'Test'],
        );
        $globalDepotPermission = Permission::firstOrCreate(
            ['slug' => 'depot.view_all'],
            ['name' => 'Akses Semua Depo', 'menu_group' => 'Test'],
        );
        $role = Role::create(['name' => 'Dashboard Tester', 'slug' => 'dashboard_tester']);
        $role->permissions()->attach([
            $permission->id,
            $globalDepotPermission->id,
            $activityPermission->id,
        ]);
        $user = User::create([
            'email' => 'activity@example.com',
            'password' => 'password',
            'full_name' => 'Activity Tester',
            'kode_depo' => '',
            'nama_depo' => '',
            'scope_level' => 'depot',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user);

        // Akun master tetap dihitung di metrik sistem, tetapi tidak boleh
        // muncul di daftar "User paling aktif".
        $master = User::create([
            'email' => 'master@example.com',
            'password' => 'password',
            'full_name' => 'Master Tester',
            'kode_depo' => '',
            'nama_depo' => '',
            'scope_level' => 'master',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        UserActivityLog::create([
            'user_id' => $master->id,
            'method' => 'POST',
            'route' => 'api/v1/rencana-kirim',
            'occurred_at' => now(),
        ]);
        UserActivityLog::create([
            'user_id' => $user->id,
            'method' => 'GET',
            'route' => 'api/v1/dashboard',
            'occurred_at' => now(),
        ]);
        UserActivityLog::create([
            'user_id' => $user->id,
            'method' => 'LOGIN',
            'route' => 'auth.login',
            'occurred_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/dashboard/activity?days=30');

        $response->assertOk()
            ->assertJsonPath('data.days', 30)
            ->assertJsonPath('data.daily.29.requests', 3)
            ->assertJsonPath('data.daily.29.active_users', 2)
            ->assertJsonPath('data.daily.29.logins', 1)
            ->assertJsonPath('data.totals.activities', 3)
            ->assertJsonPath('data.totals.logins', 1)
            ->assertJsonPath('data.totals.active_users', 2)
            ->assertJsonPath('data.totals.peak_active_users', 2)
            ->assertJsonPath('data.top_users.0.name', 'Activity Tester')
            ->assertJsonPath('data.top_users.0.requests', 2)
            ->assertJsonMissingPath('data.top_users.1')
            ->assertJsonCount(3, 'data.top_modules')
            ->assertJsonFragment(['module' => 'Rencana Kirim', 'requests' => 1])
            ->assertJsonFragment(['module' => 'Dashboard', 'requests' => 1])
            ->assertJsonFragment(['module' => 'Login & Logout', 'requests' => 1]);

        $this->assertDatabaseHas('user_activity_logs', [
            'user_id' => $user->id,
            'method' => 'GET',
            'route' => 'api/v1/dashboard/activity',
        ]);
    }

    public function test_live_activity_hides_admin_master_and_describes_action(): void
    {
        $user = $this->liveActivityUser('live-operator@example.com');
        $master = User::create([
            'email' => 'live-master@example.com',
            'password' => 'password',
            'full_name' => 'Master Live',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        UserActivityLog::create([
            'user_id' => $master->id,
            'method' => 'POST',
            'route' => 'api/v1/rencana-kirim',
            'occurred_at' => now(),
        ]);
        UserActivityLog::create([
            'user_id' => $user->id,
            'method' => 'GET',
            'route' => 'api/v1/rencana-kirim',
            'occurred_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/dashboard/activity/live')
            ->assertOk()
            ->assertJsonCount(1, 'data.events')
            ->assertJsonPath('data.events.0.user_name', 'Live Operator')
            ->assertJsonPath('data.events.0.level', 'operator')
            ->assertJsonPath('data.events.0.kode_depo', 'DPO')
            ->assertJsonPath('data.events.0.nama_depo', 'Depo Test')
            ->assertJsonPath('data.events.0.module', 'Rencana Kirim')
            ->assertJsonPath('data.events.0.action', 'Melihat Rencana Kirim');
    }

    public function test_live_activity_endpoint_does_not_log_its_own_polling(): void
    {
        $user = $this->liveActivityUser('live-no-self-log@example.com');
        Sanctum::actingAs($user);

        $this->getJson('/api/v1/dashboard/activity/live')->assertOk();

        $this->assertDatabaseMissing('user_activity_logs', [
            'user_id' => $user->id,
            'route' => 'api/v1/dashboard/activity/live',
        ]);
    }

    public function test_activity_history_lists_actor_module_and_action(): void
    {
        $user = $this->liveActivityUser('history@example.com');
        $other = User::create([
            'email' => 'history-other@example.com',
            'password' => 'password',
            'full_name' => 'Other Operator',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'cheker',
            'status' => 'active',
        ]);

        UserActivityLog::create([
            'user_id' => $user->id,
            'method' => 'POST',
            'route' => 'api/v1/rencana-kirim',
            'occurred_at' => now()->subMinute(),
        ]);
        UserActivityLog::create([
            'user_id' => $other->id,
            'method' => 'GET',
            'route' => 'api/v1/npn',
            'occurred_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/dashboard/activity/history')
            ->assertOk()
            ->assertJsonPath('total', 2)
            ->assertJsonPath('data.0.user_name', 'Other Operator')
            ->assertJsonPath('data.0.module', 'NPN')
            ->assertJsonPath('data.0.action', 'Melihat NPN')
            ->assertJsonPath('data.1.user_name', 'Live Operator')
            ->assertJsonPath('data.1.module', 'Rencana Kirim')
            ->assertJsonPath('data.1.action', 'Memproses Rencana Kirim');
    }

    public function test_activity_history_filters_by_module_and_date(): void
    {
        $user = $this->liveActivityUser('history-filter@example.com');

        UserActivityLog::create([
            'user_id' => $user->id,
            'method' => 'POST',
            'route' => 'api/v1/rencana-kirim',
            'occurred_at' => now()->subDays(2),
        ]);
        UserActivityLog::create([
            'user_id' => $user->id,
            'method' => 'LOGIN',
            'route' => 'auth.login',
            'occurred_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/dashboard/activity/history?module=Login%20%26%20Logout')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.module', 'Login & Logout');

        $this->getJson('/api/v1/dashboard/activity/history?date_from='.now()->toDateString())
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.action', 'Login ke sistem');
    }

    public function test_activity_history_respects_depot_scope(): void
    {
        $user = $this->liveActivityUser('history-scope@example.com');
        $outside = User::create([
            'email' => 'history-outside@example.com',
            'password' => 'password',
            'full_name' => 'Outside Operator',
            'kode_depo' => 'OTHER',
            'nama_depo' => 'Depo Lain',
            'level' => 'operator',
            'status' => 'active',
        ]);

        UserActivityLog::create([
            'user_id' => $user->id,
            'method' => 'GET',
            'route' => 'api/v1/rencana-kirim',
            'occurred_at' => now(),
        ]);
        UserActivityLog::create([
            'user_id' => $outside->id,
            'method' => 'GET',
            'route' => 'api/v1/rencana-kirim',
            'occurred_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/dashboard/activity/history')
            ->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.user_name', 'Live Operator');
    }

    public function test_live_activity_after_id_only_returns_new_events(): void
    {
        $user = $this->liveActivityUser('live-after@example.com');
        $first = UserActivityLog::create([
            'user_id' => $user->id,
            'method' => 'GET',
            'route' => 'api/v1/dashboard',
            'occurred_at' => now()->subMinute(),
        ]);
        $newest = UserActivityLog::create([
            'user_id' => $user->id,
            'method' => 'POST',
            'route' => 'api/v1/rencana-kirim',
            'occurred_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/dashboard/activity/live?after_id='.$first->id)
            ->assertOk()
            ->assertJsonCount(1, 'data.events')
            ->assertJsonPath('data.events.0.id', $newest->id)
            ->assertJsonPath('data.events.0.action', 'Memproses Rencana Kirim');
    }

    private function liveActivityUser(string $email): User
    {
        $permission = Permission::firstOrCreate(
            ['slug' => 'users.view'],
            ['name' => 'Users View', 'menu_group' => 'Test'],
        );
        $activityPermission = Permission::firstOrCreate(
            ['slug' => 'activity.view'],
            ['name' => 'Lihat Log Aktivitas', 'menu_group' => 'Test'],
        );
        $role = Role::firstOrCreate(
            ['slug' => 'live_activity'],
            ['name' => 'Live Activity'],
        );
        $role->permissions()->syncWithoutDetaching([
            $permission->id,
            $activityPermission->id,
        ]);

        $user = User::create([
            'email' => $email,
            'password' => 'password',
            'full_name' => 'Live Operator',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'operator',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }
}
