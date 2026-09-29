<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The web app shows the Export button only for `biaya_thl.export` /
 * `biaya_retribusi.export`, and the routes are gated on the same slugs —
 * `*.view` alone must no longer be enough to download the spreadsheet.
 */
class BiayaExportPermissionTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string $email, array $permSlugs): User
    {
        $role = Role::firstOrCreate(['slug' => 'biaya_export_tester'], ['name' => 'Biaya Export Tester']);
        foreach ($permSlugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => $email,
            'password' => 'password',
            'full_name' => 'Biaya Export Tester',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'operator',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_thl_export_forbidden_without_export_permission(): void
    {
        Sanctum::actingAs($this->userWith('thl-view-only@test.com', ['biaya_thl.view']));

        $this->getJson('/api/v1/biaya-thl/export')->assertForbidden();
    }

    public function test_thl_export_downloads_spreadsheet_with_export_permission(): void
    {
        Sanctum::actingAs($this->userWith('thl-export@test.com', ['biaya_thl.export']));

        $response = $this->get('/api/v1/biaya-thl/export');

        $response->assertOk();
        $this->assertStringContainsString(
            'spreadsheetml',
            $response->headers->get('Content-Type') ?? ''
        );
    }

    public function test_retribusi_export_forbidden_without_export_permission(): void
    {
        Sanctum::actingAs($this->userWith('ret-view-only@test.com', ['biaya_retribusi.view']));

        $this->getJson('/api/v1/biaya-retribusi/export')->assertForbidden();
    }

    public function test_retribusi_export_downloads_spreadsheet_with_export_permission(): void
    {
        Sanctum::actingAs($this->userWith('ret-export@test.com', ['biaya_retribusi.export']));

        $response = $this->get('/api/v1/biaya-retribusi/export');

        $response->assertOk();
        $this->assertStringContainsString(
            'spreadsheetml',
            $response->headers->get('Content-Type') ?? ''
        );
    }
}
