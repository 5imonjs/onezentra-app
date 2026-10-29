<?php

namespace Tests\Feature;

use App\Mail\StandarisasiStatusNotification;
use App\Models\EmailRecipient;
use App\Models\Npn;
use App\Models\Permission;
use App\Models\Role;
use App\Models\StandarisasiTumpukan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StandarisasiTumpukanControllerTest extends TestCase
{
    use RefreshDatabase;

    private function userWith(array $permSlugs, string $kodeDepo = 'DPT-A'): User
    {
        $role = Role::firstOrCreate(['slug' => 'standarisasi_test'], ['name' => 'Standarisasi Test']);
        foreach ($permSlugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $user = User::create([
            'email' => 'std-'.uniqid().'@test.com', 'password' => 'password', 'full_name' => 'Standarisasi User',
            'kode_depo' => $kodeDepo, 'nama_depo' => 'Depo '.$kodeDepo, 'level' => 'staff_logistic', 'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user;
    }

    private function makeNpn(): Npn
    {
        $suffix = uniqid();

        return Npn::create([
            'szNickName' => 'Produk STD', 'BOSnetszProductId' => 'B-STD-'.$suffix,
            'SAPszProductId' => 'SAP-STD-'.$suffix, 'szBarcode' => 'BC-STD-'.$suffix, 'szStatus' => 'EXISTING',
        ]);
    }

    public function test_store_creates_pending_with_computed_total(): void
    {
        $user = $this->userWith(['standarisasi.view', 'standarisasi.create']);
        Sanctum::actingAs($user);
        $npn = $this->makeNpn();

        $res = $this->postJson('/api/v1/standarisasi-tumpukan', [
            'npn_id' => $npn->id, 'tier' => 4, 'tinggi_tumpukan' => 3,
        ])->assertCreated();

        $res->assertJsonPath('data.status', 'pending');
        $res->assertJsonPath('data.total_tier_tinggi', 12);
        $this->assertDatabaseHas('standarisasi_tumpukan', [
            'npn_id' => $npn->id, 'requested_by' => $user->id, 'kode_depo' => 'DPT-A',
        ]);
    }

    /**
     * Pengajuan dari depo (mis. lewat aplikasi mobile) harus sampai ke BLC
     * pusat. BLC punya akses lintas depo untuk modul standarisasi, jadi
     * `kode_depo` dokumen tidak boleh memotong penerima role BLC.
     */
    public function test_store_notifies_cross_depot_blc_on_submitted(): void
    {
        Mail::fake();

        $submitter = $this->userWith(['standarisasi.create'], 'DPT-A');

        $blcRole = Role::firstOrCreate(['slug' => 'blc'], ['name' => 'BLC', 'description' => 'Approval BLC']);
        $permission = Permission::firstOrCreate(
            ['slug' => 'standarisasi.view_all'],
            ['name' => 'Standarisasi Lintas Depo', 'menu_group' => 'Standarisasi Tumpukan'],
        );
        $blcRole->permissions()->syncWithoutDetaching([$permission->id]);

        $blcPusat = User::create([
            'email' => 'blc-pusat@test.com', 'password' => 'password', 'full_name' => 'BLC Pusat',
            'kode_depo' => 'BLC-01', 'nama_depo' => 'Depo BLC', 'level' => 'blc', 'status' => 'active',
        ]);
        $blcRole->users()->attach($blcPusat->id);

        EmailRecipient::create([
            'document_type' => 'standarisasi_tumpukan', 'trigger' => 'submitted',
            'kode_depo' => null, 'recipient_type' => 'role', 'role_slug' => 'blc',
            'field' => 'TO', 'is_active' => true,
        ]);

        Sanctum::actingAs($submitter);

        $this->postJson('/api/v1/standarisasi-tumpukan', [
            'npn_id' => $this->makeNpn()->id, 'tier' => 4, 'tinggi_tumpukan' => 3,
        ])->assertCreated();

        Mail::assertSent(StandarisasiStatusNotification::class, function (StandarisasiStatusNotification $mail) use ($blcPusat): bool {
            return $mail->hasTo($blcPusat->email);
        });
    }

    public function test_store_rejects_unknown_npn(): void
    {
        Sanctum::actingAs($this->userWith(['standarisasi.create']));

        $this->postJson('/api/v1/standarisasi-tumpukan', [
            'npn_id' => 999999, 'tier' => 4, 'tinggi_tumpukan' => 3,
        ])->assertJsonValidationErrors(['npn_id']);
    }

    public function test_approve_sets_approver_and_reject_sets_status(): void
    {
        $user = $this->userWith(['standarisasi.view', 'standarisasi.approve']);
        Sanctum::actingAs($user);
        $row = StandarisasiTumpukan::create([
            'npn_id' => $this->makeNpn()->id, 'tier' => 2, 'tinggi_tumpukan' => 5,
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'status' => 'pending',
            'requested_by' => $user->id,
        ]);

        $this->postJson("/api/v1/standarisasi-tumpukan/{$row->id}/approve")
            ->assertOk()->assertJsonPath('data.status', 'approved');
        $this->assertDatabaseHas('standarisasi_tumpukan', [
            'id' => $row->id, 'approved_by' => $user->id, 'total_tier_tinggi' => 10,
        ]);

        $row2 = StandarisasiTumpukan::create([
            'npn_id' => $this->makeNpn()->id, 'tier' => 1, 'tinggi_tumpukan' => 1,
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'status' => 'pending',
            'requested_by' => $user->id,
        ]);
        $this->postJson("/api/v1/standarisasi-tumpukan/{$row2->id}/reject")
            ->assertOk()->assertJsonPath('data.status', 'rejected');
    }

    public function test_edit_after_approve_resets_to_pending(): void
    {
        $user = $this->userWith(['standarisasi.view', 'standarisasi.edit', 'standarisasi.approve']);
        Sanctum::actingAs($user);
        $row = StandarisasiTumpukan::create([
            'npn_id' => $this->makeNpn()->id, 'tier' => 2, 'tinggi_tumpukan' => 5,
            'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'status' => 'approved',
            'requested_by' => $user->id, 'approved_by' => $user->id,
        ]);

        $this->putJson("/api/v1/standarisasi-tumpukan/{$row->id}", ['tier' => 3])
            ->assertOk()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('requires_reapproval', true);

        $this->assertDatabaseHas('standarisasi_tumpukan', [
            'id' => $row->id, 'status' => 'pending', 'approved_by' => null, 'total_tier_tinggi' => 15,
        ]);
    }

    public function test_cross_depot_row_returns_403(): void
    {
        Sanctum::actingAs($this->userWith(['standarisasi.view', 'standarisasi.delete']));
        $row = StandarisasiTumpukan::create([
            'npn_id' => $this->makeNpn()->id, 'tier' => 2, 'tinggi_tumpukan' => 5,
            'kode_depo' => 'DPT-B', 'nama_depo' => 'Depo B', 'status' => 'pending',
        ]);

        $this->getJson("/api/v1/standarisasi-tumpukan/{$row->id}")->assertForbidden();
        $this->deleteJson("/api/v1/standarisasi-tumpukan/{$row->id}")->assertForbidden();
        $this->assertModelExists($row);
    }

    public function test_index_search_escapes_like_wildcards(): void
    {
        $user = $this->userWith(['standarisasi.view']);
        Sanctum::actingAs($user);

        $percent = Npn::create([
            'szNickName' => 'Diskon 50% Spesial', 'BOSnetszProductId' => 'B-PCT',
            'SAPszProductId' => 'SAP-PCT', 'szBarcode' => 'BC-PCT', 'szStatus' => 'EXISTING',
        ]);
        $plain = Npn::create([
            'szNickName' => 'Diskon 5000 Biasa', 'BOSnetszProductId' => 'B-PLAIN',
            'SAPszProductId' => 'SAP-PLAIN', 'szBarcode' => 'BC-PLAIN', 'szStatus' => 'EXISTING',
        ]);
        foreach ([$percent, $plain] as $npn) {
            StandarisasiTumpukan::create([
                'npn_id' => $npn->id, 'tier' => 2, 'tinggi_tumpukan' => 2,
                'status' => 'pending', 'requested_by' => $user->id,
                'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A',
            ]);
        }

        // Tanpa escape `%` mencocokkan SEMUA baris; dengan escape hanya baris
        // yang benar-benar memuat karakter `%`.
        $this->getJson('/api/v1/standarisasi-tumpukan?search='.urlencode('%'))
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_search_product_escapes_like_wildcards(): void
    {
        Sanctum::actingAs($this->userWith(['standarisasi.view']));

        Npn::create([
            'szNickName' => 'Diskon 50% Spesial', 'BOSnetszProductId' => 'B-PCT',
            'SAPszProductId' => 'SAP-PCT', 'szBarcode' => 'BC-PCT', 'szStatus' => 'EXISTING',
        ]);
        Npn::create([
            'szNickName' => 'Diskon 5000 Biasa', 'BOSnetszProductId' => 'B-PLAIN',
            'SAPszProductId' => 'SAP-PLAIN', 'szBarcode' => 'BC-PLAIN', 'szStatus' => 'EXISTING',
        ]);

        $this->getJson('/api/v1/standarisasi-tumpukan/search-product?q='.urlencode('%'))
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }
}
