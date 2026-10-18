<?php

namespace Tests\Feature;

use App\Models\ApprovalAssignment;
use App\Models\BiayaRetribusi;
use App\Models\BiayaThl;
use App\Models\User;
use App\Services\Biaya\BiayaApprovalPresenter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BiayaApprovalSectionsTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name, string $email): User
    {
        return User::create([
            'email' => $email,
            'password' => 'password',
            'full_name' => $name,
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
    }

    private function assignedUser(string $role, string $module, string $level, string $name, string $email): User
    {
        $user = $this->user($name, $email);

        ApprovalAssignment::create([
            'module' => $module,
            'kode_depo' => 'DPS',
            'approval_level' => $level,
            'user_id' => $user->id,
            'is_active' => true,
        ]);

        return $user;
    }

    public function test_retribusi_sections_use_retribusi_module_assignments(): void
    {
        $this->assignedUser('rlh', ApprovalAssignment::MODULE_RETRIBUSI, 'RLH', 'RLH Retribusi', 'rlh-retribusi@test.com');
        // Assignment modul THL tidak boleh bocor ke kotak retribusi.
        $this->assignedUser('rlh', ApprovalAssignment::MODULE_THL, 'RLH', 'RLH THL', 'rlh-thl@test.com');

        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 100000,
            'approval_pengajuan' => 'Pengaju Retribusi',
            'status' => 'pending',
        ]);

        $sections = collect(app(BiayaApprovalPresenter::class)
            ->approvalSectionsFor($biaya, ApprovalAssignment::MODULE_RETRIBUSI))
            ->keyBy('title');

        $this->assertSame('Pengaju Retribusi', $sections['Mengajukan']['people'][0]['name']);
        $this->assertSame('RLH Retribusi', $sections['Menyetujui']['people'][0]['name']);
    }

    public function test_thl_sections_use_thl_module_assignments(): void
    {
        $this->assignedUser('rlh', ApprovalAssignment::MODULE_THL, 'RLH', 'RLH THL', 'rlh-thl@test.com');
        $this->assignedUser('rlh', ApprovalAssignment::MODULE_RETRIBUSI, 'RLH', 'RLH Retribusi', 'rlh-retribusi@test.com');

        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 100000,
            'approval_pengajuan' => 'Pengaju THL',
            'status' => 'pending',
        ]);

        $sections = collect(app(BiayaApprovalPresenter::class)
            ->approvalSectionsFor($biaya, ApprovalAssignment::MODULE_THL))
            ->keyBy('title');

        $this->assertSame('Pengaju THL', $sections['Mengajukan']['people'][0]['name']);
        $this->assertSame('RLH THL', $sections['Menyetujui']['people'][0]['name']);
    }

    public function test_rfah_section_only_present_when_required(): void
    {
        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 100000,
            'approval_pengajuan' => 'Pengaju Retribusi',
            'status' => 'pending',
            'is_rfah_required' => false,
        ]);

        $titles = collect(app(BiayaApprovalPresenter::class)
            ->approvalSectionsFor($biaya, ApprovalAssignment::MODULE_RETRIBUSI))
            ->pluck('title')
            ->all();

        $this->assertNotContains('RFAH*', $titles);

        $biaya->update(['is_rfah_required' => true]);

        $titles = collect(app(BiayaApprovalPresenter::class)
            ->approvalSectionsFor($biaya->fresh(), ApprovalAssignment::MODULE_RETRIBUSI))
            ->pluck('title')
            ->all();

        $this->assertContains('RFAH*', $titles);
    }
}
