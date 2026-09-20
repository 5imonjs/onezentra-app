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
        $role = Role::create(['name' => 'Dashboard Tester', 'slug' => 'dashboard_tester']);
        $role->permissions()->attach($permission);
        $user = User::create([
            'email' => 'activity@example.com',
            'password' => 'password',
            'full_name' => 'Activity Tester',
            'kode_depo' => '',
            'nama_depo' => '',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        $role->users()->attach($user);
        UserActivityLog::create([
            'user_id' => $user->id,
            'method' => 'GET',
            'route' => 'api/v1/dashboard',
            'occurred_at' => now(),
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/v1/dashboard/activity?days=30');

        $response->assertOk()
            ->assertJsonPath('data.days', 30)
            ->assertJsonPath('data.daily.29.requests', 1)
            ->assertJsonPath('data.daily.29.active_users', 1)
            ->assertJsonPath('data.top_users.0.name', 'Activity Tester')
            ->assertJsonPath('data.top_users.0.requests', 1);

        $this->assertDatabaseHas('user_activity_logs', [
            'user_id' => $user->id,
            'method' => 'GET',
            'route' => 'api/v1/dashboard/activity',
        ]);
    }
}
