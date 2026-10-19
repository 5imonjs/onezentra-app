<?php

namespace Tests\Feature;

use App\Models\ApprovalAssignment;
use App\Models\DepotSetting;
use App\Models\User;
use Database\Seeders\ApprovalAssignmentSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApprovalAssignmentSeederTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $level, string $kodeDepo): User
    {
        return User::create([
            'email' => $level.'-'.strtolower($kodeDepo).'-'.uniqid().'@test.com',
            'password' => 'password',
            'full_name' => strtoupper($level).' '.$kodeDepo,
            'kode_depo' => $kodeDepo,
            'nama_depo' => 'Depo '.$kodeDepo,
            'level' => $level,
            'status' => 'active',
        ]);
    }

    public function test_seeder_mengisi_blc_bac_per_depo_dan_rlh_rfah_global(): void
    {
        DepotSetting::create(['kode_depo' => '0127', 'nama_depo' => 'Singkawang', 'is_active' => true]);
        $blc = $this->user('blc', '0127');
        $bac = $this->user('bac', '0127');
        $rlh = $this->user('rlh', '0127');
        $rfah = $this->user('rfah', '0127');

        $this->seed(ApprovalAssignmentSeeder::class);

        foreach ([ApprovalAssignment::MODULE_THL, ApprovalAssignment::MODULE_RETRIBUSI] as $module) {
            $this->assertDatabaseHas('approval_assignments', ['module' => $module, 'kode_depo' => '0127', 'approval_level' => 'BLC', 'user_id' => $blc->id, 'is_active' => true]);
            $this->assertDatabaseHas('approval_assignments', ['module' => $module, 'kode_depo' => '0127', 'approval_level' => 'BAC', 'user_id' => $bac->id]);
            $this->assertDatabaseHas('approval_assignments', ['module' => $module, 'kode_depo' => 'ADMIN', 'approval_level' => 'RLH', 'user_id' => $rlh->id]);
            $this->assertDatabaseHas('approval_assignments', ['module' => $module, 'kode_depo' => 'ADMIN', 'approval_level' => 'RFAH', 'user_id' => $rfah->id]);
        }
    }

    public function test_seeder_idempoten_dan_tidak_menimpa_penetapan_manual(): void
    {
        DepotSetting::create(['kode_depo' => '0127', 'nama_depo' => 'Singkawang', 'is_active' => true]);
        $auto = $this->user('blc', '0127');
        $manual = $this->user('blc', '0127');
        $this->user('bac', '0127');
        ApprovalAssignment::create([
            'module' => ApprovalAssignment::MODULE_THL,
            'kode_depo' => '0127',
            'approval_level' => 'BLC',
            'user_id' => $manual->id,
            'is_active' => true,
        ]);

        $this->seed(ApprovalAssignmentSeeder::class);
        $this->seed(ApprovalAssignmentSeeder::class);

        $this->assertSame(1, ApprovalAssignment::where('module', ApprovalAssignment::MODULE_THL)
            ->where('kode_depo', '0127')->where('approval_level', 'BLC')->count());
        $this->assertSame($manual->id, (int) ApprovalAssignment::where('module', ApprovalAssignment::MODULE_THL)
            ->where('kode_depo', '0127')->where('approval_level', 'BLC')->value('user_id'));
        $this->assertNotSame($auto->id, $manual->id);
    }

    public function test_seeder_fallback_ke_depo_nyata_saat_depot_settings_kosong(): void
    {
        // Tanpa depot_settings hanya depo yang punya BLC & BAC aktif dipakai;
        // akun peran (ADMIN / BLC-01) tidak boleh jadi "depo".
        $this->user('blc', '0127');
        $this->user('bac', '0127');
        $this->user('rlh', '0127');
        $this->user('blc', 'BLC-01');
        $this->user('bac', 'ADMIN');

        $this->seed(ApprovalAssignmentSeeder::class);

        $this->assertDatabaseHas('approval_assignments', ['kode_depo' => '0127', 'approval_level' => 'BLC']);
        $this->assertDatabaseHas('approval_assignments', ['kode_depo' => '0127', 'approval_level' => 'BAC']);
        $this->assertDatabaseMissing('approval_assignments', ['kode_depo' => 'BLC-01']);
        $this->assertDatabaseMissing('approval_assignments', ['kode_depo' => 'ADMIN', 'approval_level' => 'BAC']);
    }

    public function test_seeder_memilih_rlh_rfah_dari_depo_nyata_bukan_akun_peran(): void
    {
        DepotSetting::create(['kode_depo' => '0127', 'nama_depo' => 'Singkawang', 'is_active' => true]);
        // Akun peran dibuat lebih dulu (id lebih kecil) agar urutan id saja
        // akan salah memilih kalau tidak diprioritaskan depo nyata.
        $roleRlh = $this->user('rlh', 'RLH-01');
        $depotRlh = $this->user('rlh', '0127');

        $this->seed(ApprovalAssignmentSeeder::class);

        $this->assertDatabaseHas('approval_assignments', ['kode_depo' => 'ADMIN', 'approval_level' => 'RLH', 'user_id' => $depotRlh->id]);
        $this->assertDatabaseMissing('approval_assignments', ['kode_depo' => 'ADMIN', 'approval_level' => 'RLH', 'user_id' => $roleRlh->id]);
    }

    public function test_seeder_melewati_level_tanpa_user_aktif(): void
    {
        DepotSetting::create(['kode_depo' => '0127', 'nama_depo' => 'Singkawang', 'is_active' => true]);
        $this->user('blc', '0127');

        $this->seed(ApprovalAssignmentSeeder::class);

        $this->assertDatabaseHas('approval_assignments', ['kode_depo' => '0127', 'approval_level' => 'BLC']);
        $this->assertDatabaseMissing('approval_assignments', ['kode_depo' => '0127', 'approval_level' => 'BAC']);
        $this->assertDatabaseMissing('approval_assignments', ['kode_depo' => 'ADMIN']);
    }
}
