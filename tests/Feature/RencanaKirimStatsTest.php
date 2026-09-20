<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RencanaKirimStatsTest extends TestCase
{
    use RefreshDatabase;

    private function viewer(bool $viewAll = true): User
    {
        $role = Role::firstOrCreate(['slug' => 'rk_stats_view'], ['name' => 'RK Stats View']);
        $perm = Permission::firstOrCreate(
            ['slug' => 'rencana_kirim.view'],
            ['name' => 'rencana_kirim.view', 'menu_group' => 'Rencana Kirim']
        );
        $role->permissions()->syncWithoutDetaching([$perm->id]);

        if ($viewAll) {
            $viewAllPerm = Permission::firstOrCreate(
                ['slug' => 'depot.view_all'],
                ['name' => 'depot.view_all']
            );
            $role->permissions()->syncWithoutDetaching([$viewAllPerm->id]);
        }

        $user = User::create([
            'email' => 'rk-stats-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'RK Stats User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_stats_include_today_count_and_calendar_breakdown(): void
    {
        $user = $this->viewer();
        $today = now()->toDateString();
        $tomorrow = now()->addDay()->toDateString();

        // Dua RK dengan rkh_date hari ini (beda status), satu untuk besok.
        RencanaKirim::create(['po_transporter' => 'PO-A', 'status' => 'SCHEDULED', 'rkh_date' => $today, 'created_by' => $user->id]);
        RencanaKirim::create(['po_transporter' => 'PO-B', 'status' => 'CHECKED_IN', 'rkh_date' => $today, 'created_by' => $user->id]);
        RencanaKirim::create(['po_transporter' => 'PO-C', 'status' => 'COMPLETED', 'rkh_date' => $tomorrow, 'created_by' => $user->id]);

        Sanctum::actingAs($user);
        $res = $this->getJson('/api/v1/rencana-kirim/stats')->assertOk();

        // Kontrak lama tetap utuh.
        $this->assertSame(3, $res->json('total'));
        $this->assertSame(1, $res->json('data.SCHEDULED.count'));
        $this->assertSame(1, $res->json('data.CHECKED_IN.count'));
        $this->assertSame(1, $res->json('data.COMPLETED.count'));

        // Kontrak baru: hitungan hari ini + agregat kalender.
        $this->assertSame(2, $res->json('today_count'));

        $calendar = $res->json('calendar');
        $this->assertCount(2, $calendar);
        // Urutan menurun: tanggal terbaru dulu.
        $this->assertSame([$tomorrow, $today], array_column($calendar, 'date'));

        $todayEntry = collect($calendar)->firstWhere('date', $today);
        $this->assertSame(2, $todayEntry['count']);
        $this->assertSame(1, $todayEntry['breakdown']['SCHEDULED']);
        $this->assertSame(1, $todayEntry['breakdown']['CHECKED_IN']);

        $tomorrowEntry = collect($calendar)->firstWhere('date', $tomorrow);
        $this->assertSame(1, $tomorrowEntry['count']);
        $this->assertSame(1, $tomorrowEntry['breakdown']['COMPLETED']);
    }

    public function test_stats_respect_depot_scoping(): void
    {
        // Tanpa depot.view_all: hanya RK satu depo yang terhitung.
        $user = $this->viewer(viewAll: false);
        $today = now()->toDateString();

        RencanaKirim::create(['po_transporter' => 'PO-DPO', 'status' => 'SCHEDULED', 'rkh_date' => $today, 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'created_by' => $user->id]);
        RencanaKirim::create(['po_transporter' => 'PO-OTHER', 'status' => 'SCHEDULED', 'rkh_date' => $today, 'kode_depo' => 'OTHER', 'nama_depo' => 'Depo Lain', 'created_by' => $user->id]);

        Sanctum::actingAs($user);
        $res = $this->getJson('/api/v1/rencana-kirim/stats')->assertOk();

        // Hanya RK satu depo yang terhitung (global maupun kalender).
        $this->assertSame(1, $res->json('total'));
        $this->assertSame(1, $res->json('today_count'));
        $calendar = $res->json('calendar');
        $this->assertCount(1, $calendar);
        $this->assertSame(1, $calendar[0]['breakdown']['SCHEDULED']);
    }
}
