<?php

namespace Tests\Feature;

use App\Models\DepotSetting;
use App\Models\Permission;
use App\Models\Region;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * INVENTARIS aturan akses — pagar sebelum admin policy class.
 *
 * Policy class memindahkan aturan akses dari controller ke tempat terpisah.
 * Bahaya khasnya adalah "gate ganda": aturan yang sama dievaluasi dua kali,
 * atau — lebih buruk — versi policy lebih longgar dari versi lama sehingga
 * akses yang tadinya ditolak jadi lolos tanpa ada test yang gagal.
 *
 * Test di sini menangkap APA yang terjadi sekarang, sebelum ada perubahan:
 * setiap endpoint ditolak (403) maupun diizinkan, untuk user yang SHOULD punya
 * akses dan yang TIDAK. Nilai inilah yang jadi acuan — kalau sebuah policy
 * membuat salah satu test ini berubah, itu regresi, bukan perbaikan.
 *
 * A. Semua endpoint mutating wajib punya gate permission di level route.
 *  B. Aturan akses berbasis role yang ada di dalam controller.
 *
 * Gate route TIDAK boleh dihapus saat policy ditambahkan. Gate berjalan
 * sebelum controller dieksekusi, jadi menangguhkan proteksi ke policy berarti
 * request sudah diproses dan query sudah jalan sebelum penolakan.
 */
class AuthorizationInventoryTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string $roleSlug, array $perms = [], string $level = 'staff_logistic'): User
    {
        Region::firstOrCreate(['code' => 'REG-1'], ['name' => 'Region Satu']);
        DepotSetting::updateOrCreate(
            ['kode_depo' => 'DPO'],
            ['nama_depo' => 'Depo', 'region_id' => 'REG-1', 'is_active' => true],
        );
        $role = Role::firstOrCreate(['slug' => 'role_'.$roleSlug], ['name' => $roleSlug, 'slug' => 'role_'.$roleSlug]);
        foreach ($perms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'inv-'.$roleSlug.'-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => ucfirst($roleSlug),
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'region_id' => 'REG-1',
            'scope_level' => $level === 'admin_master' ? 'master' : 'depot',
            'level' => $level,
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user->fresh()->load('roles');
    }

    // ------------------------------------------------------------------
    // A. Gate di route — fondasi yang tidak boleh goyah
    // ------------------------------------------------------------------

    /**
     * Setiap endpoint yang mengubah data harus tetap punya gate permission di
     * level route, di samping policy bila ada.
     */
    public function test_setiap_endpoint_mutating_memiliki_permission_gate(): void
    {
        $unguarded = [];

        foreach (Route::getRoutes() as $route) {
            $methods = $route->methods();
            if ($methods && ! array_diff($methods, ['GET', 'HEAD', 'OPTIONS'])) {
                continue;
            }

            $uri = $route->uri();
            // Endpoint auth memang tidak digate permission — credential dan
            // throttle yang melindungi; menambah permission akan break login.
            if (str_starts_with($uri, 'api/login') || str_starts_with($uri, 'api/mobile/login')) {
                continue;
            }
            if (str_contains($uri, 'logout') || $uri === 'api/register') {
                continue;
            }
            // `PUT /api/v1/user` adalah update profil milik sendiri. Tidak
            // digate permission karena permission tidak berlaku untuk "user
            // ini" — yang ada adalah ownership. Endpoint-nya sudah membatasi
            // field ke full_name/email/password (AuthController::updateProfile)
            // dan mewajibkan current_password saat mengganti password, jadi
            // tidak bisa dipakai menaikkan privilege lewat role_id/kode_depo.
            if ($uri === 'api/v1/user') {
                continue;
            }

            $middleware = collect($route->gatherMiddleware());
            $hasPermission = $middleware->contains(fn ($m) => is_string($m) && str_starts_with($m, 'permission:'));
            $hasAuth = $middleware->contains(fn ($m) => is_string($m) && str_starts_with($m, 'auth:'));

            if (! $hasPermission && $hasAuth) {
                $unguarded[] = implode('|', $methods).' /'.$uri;
            }
        }

        $this->assertSame([], $unguarded, 'Endpoint berikut punya auth tapi tanpa permission gate.');
    }

    /**
     * Policy tidak boleh menjadi satu-satunya proteksi. Menghapus gate route
     * dan menggantungkan diri pada policy membuat proteksi middleware tidak
     * konsisten: sebagian endpoint terproteksi, sebagian lagi tidak.
     */
    public function test_route_api_v1_tetap_utuh(): void
    {
        $semuaApi = collect(Route::getRoutes())->filter(
            fn ($route) => str_starts_with($route->uri(), 'api/v1/')
        );

        $this->assertGreaterThan(
            100,
            $semuaApi->count(),
            'Jumlah route api/v1 anjlok drastis — cek apakah route definition masih utuh.'
        );
    }

    // ------------------------------------------------------------------
    // B. Aturan akses berbasis role yang ada di dalam controller
    // ------------------------------------------------------------------

    /**
     * `admin_master` adalah role tertinggi. Sebelum policy diperkenalkan, aturan
     * ini hidup inline di UserController; kini dievaluasi oleh UserPolicy
     * (`assignAdminMaster`). Test ini mengunci NILAINYA — bukan lokasinya —
     * supaya pemindahan ke policy tidak melonggarkan akses.
     */
    public function test_hanya_admin_master_boleh_menetapkan_admin_master(): void
    {
        $staff = $this->userWith('staff_logistic', ['users.create']);
        Sanctum::actingAs($staff);

        $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo',
            'region_id' => 'REG-1', 'scope_level' => 'depot',
            'full_name' => 'Escalation', 'email' => 'esc-'.uniqid().'@example.com',
            'password' => 'password123', 'password_confirmation' => 'password123',
            'level' => 'admin_master',
        ])->assertStatus(403);
    }

    /** Staff biasa boleh membuat user biasa — sisi positif dari aturan yang sama. */
    public function test_staff_boleh_membuat_user_biasa(): void
    {
        $staff = $this->userWith('staff_logistic', ['users.create']);
        Sanctum::actingAs($staff);

        $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo',
            'region_id' => 'REG-1', 'scope_level' => 'depot',
            'full_name' => 'User Baru', 'email' => 'nb-'.uniqid().'@example.com',
            'password' => 'password123', 'password_confirmation' => 'password123',
            'level' => 'staff_logistic',
        ])->assertStatus(201);
    }

    /**
     * User tanpa permission `users.create` ditolak meski terautentikasi.
     * Sisi negatif dari gate route — membuktikan gate benar-benar bekerja,
     * bukan hanya ada di definisi route.
     */
    public function test_tanpa_permission_ditolak(): void
    {
        $user = $this->userWith('staff_logistic', []); // tanpa users.create
        Sanctum::actingAs($user);

        $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo',
            'region_id' => 'REG-1', 'scope_level' => 'depot',
            'full_name' => 'Tanpa Izin', 'email' => 'ti-'.uniqid().'@example.com',
            'password' => 'password123', 'password_confirmation' => 'password123',
            'level' => 'staff_logistic',
        ])->assertStatus(403);
    }

    /**
     * Staff tidak boleh MENGUBAH akun admin master (jalur update).
     * Tanpa ini, hanya sisi create yang terkunci — update/delete tetap
     * bisa jadi celah eskalasi walau create sudah lewat policy.
     */
    public function test_staff_tidak_boleh_mengubah_akun_admin_master(): void
    {
        $staff = $this->userWith('staff_logistic', ['users.edit']);
        $master = $this->userWith('master_victim', [], 'admin_master');
        Sanctum::actingAs($staff);

        $this->putJson("/api/v1/users/{$master->id}", [
            'full_name' => 'Diubah Staff',
        ])->assertStatus(403);
    }

    /**
     * Staff tidak boleh MENGHAPUS akun admin master (jalur delete).
     */
    public function test_staff_tidak_boleh_menghapus_akun_admin_master(): void
    {
        $staff = $this->userWith('staff_logistic', ['users.delete']);
        $master = $this->userWith('master_victim_del', [], 'admin_master');
        Sanctum::actingAs($staff);

        $this->deleteJson("/api/v1/users/{$master->id}")->assertStatus(403);
    }

    /**
     * Non-admin tidak boleh mengubah level/status akun lain (anti-eskalasi),
     * dan setiap perubahan akun mencatat pelakunya di updated_by.
     */
    public function test_non_admin_tidak_boleh_mengubah_level_atau_status(): void
    {
        $staff = $this->userWith('staff_logistic', ['users.view', 'users.edit']);
        $victim = $this->userWith('victim_user', []);
        Sanctum::actingAs($staff);

        $this->putJson("/api/v1/users/{$victim->id}", ['level' => 'rlh'])
            ->assertForbidden();
        $this->putJson("/api/v1/users/{$victim->id}", ['status' => 'inactive'])
            ->assertForbidden();
        $this->assertSame('staff_logistic', $victim->fresh()->level);
        $this->assertSame('active', $victim->fresh()->status);

        // Ubah field biasa tetap boleh + tercatat pelakunya.
        $this->putJson("/api/v1/users/{$victim->id}", ['full_name' => 'Nama Baru'])
            ->assertOk();
        $this->assertSame('Nama Baru', $victim->fresh()->full_name);
        $this->assertSame($staff->id, (int) $victim->fresh()->updated_by);
    }
}
