<?php

namespace Tests\Feature;

use App\Models\Npn;
use App\Models\Permission;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ExportRowLimitTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string $email, array $permSlugs): User
    {
        $role = Role::firstOrCreate(['slug' => 'export_guard_test'], ['name' => 'Export Guard Test']);
        foreach ($permSlugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => $email, 'password' => 'password', 'full_name' => 'Export User',
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test', 'level' => 'staff_logistic', 'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_export_over_row_limit_returns_422_with_guidance(): void
    {
        config()->set('exports.max_rows', 1);
        Sanctum::actingAs($this->userWith('export-cap@test.com', ['npn.view']));

        Npn::create(['szNickName' => 'P1', 'BOSnetszProductId' => 'B-1', 'szStatus' => 'EXISTING']);
        Npn::create(['szNickName' => 'P2', 'BOSnetszProductId' => 'B-2', 'szStatus' => 'EXISTING']);

        $this->getJson('/api/v1/npn/export')
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'Data melebihi batas 1 baris (2 baris). Persempit filter lalu coba lagi.']);
    }

    public function test_export_within_row_limit_downloads(): void
    {
        Sanctum::actingAs($this->userWith('export-ok@test.com', ['npn.view']));

        Npn::create(['szNickName' => 'P1', 'BOSnetszProductId' => 'B-1', 'szStatus' => 'EXISTING']);

        $response = $this->get('/api/v1/npn/export');
        $response->assertOk();
        $this->assertStringContainsString(
            'spreadsheetml',
            $response->headers->get('Content-Type') ?? ''
        );
    }

    public function test_report_export_over_row_limit_returns_422(): void
    {
        config()->set('exports.max_rows', 1);
        $user = $this->userWith('export-rk@test.com', ['reports.rencana_kirim', 'depot.view_all']);
        Sanctum::actingAs($user);

        RencanaKirim::create(['po_transporter' => 'PO-E1', 'status' => 'SCHEDULED', 'created_by' => $user->id]);
        RencanaKirim::create(['po_transporter' => 'PO-E2', 'status' => 'SCHEDULED', 'created_by' => $user->id]);

        $this->getJson('/api/v1/reports/rencana-kirim/export')->assertStatus(422);
    }
}
