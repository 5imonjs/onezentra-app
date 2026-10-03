<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Audit keamanan lintas-modul.
 *
 * Berisi temuan nyata yang ditemukan saat audit, bukan placeholder.
 */
class SecurityAuditTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(string $roleSlug, array $extraPerms = []): User
    {
        $role = Role::firstOrCreate(['slug' => $roleSlug], ['name' => $roleSlug, 'slug' => $roleSlug]);
        foreach ($extraPerms as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug]);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => $roleSlug.'-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => ucfirst($roleSlug),
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'level' => $roleSlug,
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user->fresh();
    }

    /**
     * `role_id` TIDAK lagi mass-assignable.
     *
     * Nilai assertion ini sengaja dibalik dari assertContains ke
     * assertNotContains: nilai lama mengunci status quo yang justru
     * menjadi celahnya.
     *
     * Kolom `role_id` sendiri masih ada di tabel `users` (legacy, tidak
     * dibaca otorisasi mana pun — permission resolving lewat pivot
     * `role_user`). Yang dijaga test ini HANYA bahwa kolom itu tidak lagi
     * bisa diisi dari payload request lewat create()/update(). Server tetap
     * boleh menuliskannya secara eksplisit — lihat test berikutnya.
     */
    public function test_role_id_is_not_mass_assignable_on_user(): void
    {
        $this->assertNotContains(
            'role_id',
            (new User)->getFillable(),
            'role_id kembali mass-assignable. Bila rules() suatu saat mengizinkan '
            .'field ini tanpa sengaja, user bisa elevating role sendiri lewat request.'
        );
    }

    /**
     * Melindungi terhadap asumsi "mass-assignment sudah aman karena fillable
     * sempit", yang tetap bisa keliru di arah lain: `update(['role_id' => ...])`
     * milik server diam-diam berubah jadi no-op begitu kolomnya dikeluarkan
     * dari fillable, sehingga kolom legacy tidak pernah terisi lagi.
     *
     * Test ini mengunci kedua sisi sekaligus — payload tidak bisa menimpa,
     * tapi server tetap bisa mengisi.
     */
    public function test_role_id_bisa_ditulis_server_walau_tidak_fillable(): void
    {
        $role = Role::firstOrCreate(['slug' => 'staff_logistic'], ['name' => 'Staff', 'slug' => 'staff_logistic']);

        $user = User::create([
            'email' => 'legacy-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Legacy',
            'kode_depo' => 'AA',
            'nama_depo' => 'Depo AA',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);

        // Mass-assignment TIDAK boleh mengisi kolom ini.
        $user->update(['role_id' => $role->id]);
        $this->assertNotSame(
            $role->id,
            (int) $user->fresh()->role_id,
            'role_id masih bisa diisi lewat update() — fillable belum diketatkan.'
        );

        // Penulisan eksplisit oleh server TETAP harus bisa.
        $user->forceFill(['role_id' => $role->id])->save();
        $this->assertSame(
            $role->id,
            (int) $user->fresh()->role_id,
            'forceFill tidak bisa menulis role_id — kolom legacy tidak akan pernah terisi.'
        );
    }

    /** Guard utama: role tetap ditentukan server, bukan dari payload. */
    public function test_role_cannot_be_escalated_via_role_id_in_payload(): void
    {
        Sanctum::actingAs($this->userWith('admin_master', ['users.create']));

        // RefreshDatabase tidak menjalankan seeder, jadi kedua role ini dibuat
        // eksplisit — kalau tidak, firstOrFail() di bawah akan gagal dan test
        // 보고 "lolos" tanpa benar-benar menguji apa pun.
        foreach (['admin_master', 'staff_logistic'] as $slug) {
            Role::firstOrCreate(['slug' => $slug], ['name' => $slug, 'slug' => $slug]);
        }

        $adminRole = Role::where('slug', 'admin_master')->firstOrFail();
        $staffRole = Role::where('slug', 'staff_logistic')->firstOrFail();

        $res = $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo',
            'full_name' => 'Payload Attack',
            'email' => 'atk-'.uniqid().'@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'level' => 'staff_logistic',
            // Sengaja kirim role_id admin — harus DIABAIKAN.
            'role_id' => $adminRole->id,
            'is_admin' => true,
        ])->assertCreated();

        $created = User::where('email', $res->json('data.email'))->firstOrFail();

        $this->assertNotSame(
            $adminRole->id,
            (int) $created->role_id,
            'role_id dari payload menimpa role server — privilege escalation!'
        );
        $this->assertSame(
            $staffRole->id,
            (int) $created->role_id,
            'Role harus mengikuti level yang diminta server, bukan role_id dari payload.'
        );
    }

    /** Guard admin_master pada create user harus tetap berlaku. */
    public function test_non_admin_cannot_create_admin_master(): void
    {
        Sanctum::actingAs($this->userWith('staff_logistic', ['users.create']));

        $this->postJson('/api/v1/users', [
            'kode_depo' => 'DPO', 'nama_depo' => 'Depo',
            'full_name' => 'Attacker', 'email' => 'atk-'.uniqid().'@example.com',
            'password' => 'password123', 'password_confirmation' => 'password123',
            'level' => 'admin_master',
        ])->assertStatus(403);
    }

    /**
     * Ini yang membuat "API gateway" benar-benar ada: setiap route v1 yang
     * melewati auth:sanctum harus 401 tanpa kredensial, bukan 200 atau 500.
     */
    public function test_all_protected_endpoints_require_authentication(): void
    {
        $unprotected = [];

        foreach (self::protectedEndpoints() as [$method, $uri]) {
            $res = $this->json($method, $uri);
            if ($res->status() !== 401) {
                $unprotected[] = "{$method} {$uri} => {$res->status()}";
            }
        }

        $this->assertSame([], $unprotected, 'Endpoint berikut tidak menolak tanpa token: '.implode(', ', $unprotected));
    }

    /**
     * TEMUAN RISIKO TINGGI: setiap endpoint yang mengubah data harus punya
     * permission gate. Kalau ada yang hanya auth tanpa permission, user role
     * mana pun bisa mengubah data master.
     *
     * 403 = ada gate. 422 = ada gate tapi lolos ke validasi (tetap aman).
     * 404/405/200/500 = tidak ada gate -> bocor.
     */
    public function test_all_mutating_endpoints_have_permission_gate(): void
    {
        $user = $this->userWith('staff_logistic');

        // Verb + path HARUS sesuai route table. 404/405 di sini berarti test
        // yang salah, bukan endpoint bocor — makanya daftar ini sengaja diambil
        // dari `php artisan route:list`, bukan diketik dari ingatan.
        $mutating = [
            ['POST', '/api/v1/users'],
            ['POST', '/api/v1/roles'],
            ['POST', '/api/v1/permissions'],
            ['POST', '/api/v1/npn'],
            ['POST', '/api/v1/cluster-principal'],
            ['POST', '/api/v1/cluster-principal/import'],
            ['POST', '/api/v1/receivings'],
            ['POST', '/api/v1/sj-validations/start/1'],
            ['POST', '/api/v1/opname-expired/generate'],
            ['POST', '/api/v1/rencana-kirim'],
            ['POST', '/api/v1/biaya-thl'],
            ['POST', '/api/v1/biaya-retribusi'],
            ['POST', '/api/v1/docks'],
            ['POST', '/api/v1/gate-transactions'],
            ['POST', '/api/v1/penerimaan'],
            ['POST', '/api/v1/standarisasi-tumpukan'],
        ];

        $leaks = [];
        foreach ($mutating as [$method, $uri]) {
            $res = $this->actingAs($user)->json($method, $uri);
            if (! in_array($res->status(), [403, 422], true)) {
                $leaks[] = "{$method} {$uri} => {$res->status()}";
            }
        }

        $this->assertSame([], $leaks, 'Endpoint mutating tanpa permission gate: '.implode(', ', $leaks));
    }

    /** @return array<int, array{0:string,1:string}> */
    private static function protectedEndpoints(): array
    {
        return [
            ['GET', '/api/v1/users'],
            ['GET', '/api/v1/roles'],
            ['GET', '/api/v1/permissions'],
            ['GET', '/api/v1/dashboard/summary'],
            ['GET', '/api/v1/npn'],
            ['GET', '/api/v1/cluster-principal'],
            ['GET', '/api/v1/receivings'],
            ['GET', '/api/v1/sj-validations'],
            ['GET', '/api/v1/opname-expired'],
            ['GET', '/api/v1/rencana-kirim'],
            ['GET', '/api/v1/biaya-thl'],
            ['GET', '/api/v1/biaya-retribusi'],
            ['GET', '/api/v1/reports/selisih-qty'],
            ['GET', '/api/v1/reports/biaya-thl'],
            ['GET', '/api/v1/storage/x'],
        ];
    }

    /** Password tidak boleh pernah keluar di response API. */
    public function test_password_never_leaks_in_user_response(): void
    {
        Sanctum::actingAs($this->userWith('admin_master', ['users.view']));

        $res = $this->getJson('/api/v1/users')->assertOk();

        $this->assertStringNotContainsString('password', $res->getContent());
    }
}
