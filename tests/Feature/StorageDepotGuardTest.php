<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * File bukti hanya bisa dibuka pemilik depo baris yang merujuknya;
 * path tanpa pemilik = 404 (fail-closed anti enumerasi).
 */
class StorageDepotGuardTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $depo): User
    {
        $role = Role::firstOrCreate(['slug' => 'storage_guard_'.$depo], ['name' => 'Storage Guard '.$depo]);
        $perm = Permission::firstOrCreate(['slug' => 'penerimaan.view'], ['name' => 'penerimaan.view']);
        $role->permissions()->syncWithoutDetaching([$perm->id]);

        $user = User::create([
            'email' => 'storage-'.strtolower($depo).'-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'Storage Guard',
            'kode_depo' => $depo,
            'nama_depo' => 'Depo '.$depo,
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    public function test_file_accessible_to_owner_depot_only(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('validation-photos/probe.jpg', 'bytes');

        ReceivingItem::create([
            'source' => 'IMPORT_MANUAL',
            'kode_barang' => 'B-ST-01',
            'actual_qty' => 1,
            'expected_qty' => 1,
            'expired_date' => '2027-01-01',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo DPO',
            'photo' => 'validation-photos/probe.jpg',
        ]);

        Sanctum::actingAs($this->user('DPO'));
        $this->get('/api/v1/storage/validation-photos/probe.jpg')->assertOk();

        Sanctum::actingAs($this->user('LAIN'));
        $this->get('/api/v1/storage/validation-photos/probe.jpg')->assertForbidden();
    }

    public function test_ownerless_path_is_not_found(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('validation-photos/orphan.jpg', 'bytes');

        Sanctum::actingAs($this->user('DPO'));
        $this->get('/api/v1/storage/validation-photos/orphan.jpg')->assertNotFound();
        $this->get('/api/v1/storage/validation-photos/missing.jpg')->assertNotFound();
    }
}
