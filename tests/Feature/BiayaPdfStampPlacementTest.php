<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\BiayaRetribusiController;
use App\Http\Controllers\Api\V1\BiayaThlController;
use App\Models\BiayaRetribusi;
use App\Models\BiayaThl;
use App\Models\BiayaThlDetail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BiayaPdfStampPlacementTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $level, string $name): User
    {
        return User::create([
            'email' => strtolower($name).'@test.com',
            'password' => 'password',
            'full_name' => $name,
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'level' => $level,
            'status' => 'active',
        ]);
    }

    public function test_thl_revisi_oleh_bac_menempatkan_cap_revisi_di_kotak_mengetahui(): void
    {
        $bac = $this->user('bac', 'Bac User');
        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'created_by' => $bac->id,
            'status' => 'revisi',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $bac->id,
            'revised_at' => '2026-09-24 11:00:00',
            'revised_by' => $bac->id,
            'revisi_reason' => 'Foto belum lengkap',
        ])->load('submittedBy', 'revisedBy');

        $stamps = app(BiayaThlController::class)->resolveStamps($biaya);

        $this->assertSame('PENGAJUAN', $stamps['Mengajukan']['text']);
        $this->assertSame('REVISI', $stamps['Mengetahui']['text']);
        $this->assertArrayNotHasKey('Menyetujui', $stamps);
        $this->assertArrayNotHasKey('RFAH*', $stamps);
    }

    public function test_thl_revisi_oleh_rlh_tetap_menempatkan_cap_revisi_di_kotak_menyetujui(): void
    {
        $rlh = $this->user('rlh', 'Rlh User');
        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'created_by' => $rlh->id,
            'status' => 'revisi',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $rlh->id,
            'checked_at' => '2026-09-24 10:30:00',
            'checked_by' => $rlh->id,
            'revised_at' => '2026-09-24 11:00:00',
            'revised_by' => $rlh->id,
        ])->load('submittedBy', 'checkedBy', 'revisedBy');

        $stamps = app(BiayaThlController::class)->resolveStamps($biaya);

        $this->assertSame('PENGAJUAN', $stamps['Mengajukan']['text']);
        $this->assertSame('DIPERIKSA', $stamps['Mengetahui']['text']);
        $this->assertSame('REVISI', $stamps['Menyetujui']['text']);
        $this->assertArrayNotHasKey('RFAH*', $stamps);
    }

    public function test_thl_revisi_oleh_rfah_menempatkan_cap_revisi_di_kotak_rfah(): void
    {
        $rlh = $this->user('rlh', 'Rlh User');
        $rfah = $this->user('rfah', 'Rfah User');
        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'is_rfah_required' => true,
            'rfah_name' => 'Rfah User',
            'created_by' => $rlh->id,
            'status' => 'revisi',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $rlh->id,
            'checked_at' => '2026-09-24 10:30:00',
            'checked_by' => $rlh->id,
            'rlh_approved_at' => '2026-09-24 10:45:00',
            'rlh_approved_by' => $rlh->id,
            'revised_at' => '2026-09-24 11:00:00',
            'revised_by' => $rfah->id,
        ])->load('submittedBy', 'checkedBy', 'rlhApprovedBy', 'revisedBy');

        $stamps = app(BiayaThlController::class)->resolveStamps($biaya);

        $this->assertSame('PENGAJUAN', $stamps['Mengajukan']['text']);
        $this->assertSame('DIPERIKSA', $stamps['Mengetahui']['text']);
        $this->assertSame('REVISI', $stamps['RFAH*']['text']);
        $this->assertSame('DISETUJUI RLH', $stamps['Menyetujui']['text']);
    }

    public function test_thl_ditolak_oleh_rfah_menempatkan_cap_ditolak_di_kotak_rfah(): void
    {
        $rlh = $this->user('rlh', 'Rlh User');
        $rfah = $this->user('rfah', 'Rfah User');
        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'is_rfah_required' => true,
            'rfah_name' => 'Rfah User',
            'created_by' => $rlh->id,
            'status' => 'rejected',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $rlh->id,
            'checked_at' => '2026-09-24 10:30:00',
            'checked_by' => $rlh->id,
            'rlh_approved_at' => '2026-09-24 10:45:00',
            'rlh_approved_by' => $rlh->id,
            'rejected_at' => '2026-09-24 11:00:00',
            'rejected_by' => $rfah->id,
            'rejection_reason' => 'Nominal melebihi batas',
        ])->load('submittedBy', 'checkedBy', 'rlhApprovedBy', 'rejectedBy');

        $stamps = app(BiayaThlController::class)->resolveStamps($biaya);

        $this->assertSame('DITOLAK', $stamps['RFAH*']['text']);
        $this->assertSame('DISETUJUI RLH', $stamps['Menyetujui']['text']);
    }

    public function test_retribusi_revisi_oleh_bac_menempatkan_cap_revisi_di_kotak_mengetahui(): void
    {
        $bac = $this->user('bac', 'Bac Retribusi');
        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'created_by' => $bac->id,
            'status' => 'revisi',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $bac->id,
            'revised_at' => '2026-09-24 11:00:00',
            'revised_by' => $bac->id,
            'revisi_reason' => 'Dokumen belum lengkap',
        ])->load('submittedBy', 'revisedBy');

        $stamps = app(BiayaRetribusiController::class)->resolveStamps($biaya);

        $this->assertSame('PENGAJUAN', $stamps['Mengajukan']['text']);
        $this->assertSame('REVISI', $stamps['Mengetahui']['text']);
        $this->assertArrayNotHasKey('Menyetujui', $stamps);
        $this->assertArrayNotHasKey('RFAH*', $stamps);
    }

    public function test_retribusi_revisi_oleh_rfah_menempatkan_cap_revisi_di_kotak_rfah(): void
    {
        $rfah = $this->user('rfah', 'Rfah Retribusi');
        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'created_by' => $rfah->id,
            'status' => 'revisi',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $rfah->id,
            'revised_at' => '2026-09-24 11:00:00',
            'revised_by' => $rfah->id,
        ])->load('submittedBy', 'revisedBy');

        $stamps = app(BiayaRetribusiController::class)->resolveStamps($biaya);

        $this->assertSame('REVISI', $stamps['RFAH*']['text']);
        $this->assertArrayNotHasKey('Menyetujui', $stamps);
    }

    public function test_retribusi_revisi_oleh_rfah_rlh_tetap_mencatat_disetujui_rlh(): void
    {
        $rlh = $this->user('rlh', 'Rlh Retribusi');
        $rfah = $this->user('rfah', 'Rfah Retribusi');
        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'is_rfah_required' => true,
            'rfah_name' => 'Rfah Retribusi',
            'approval_pengajuan' => 'Pengaju Depo',
            'created_by' => $rlh->id,
            'status' => 'revisi',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $rlh->id,
            'checked_at' => '2026-09-24 10:30:00',
            'checked_by' => $rlh->id,
            'rlh_approved_at' => '2026-09-24 10:45:00',
            'rlh_approved_by' => $rlh->id,
            'revised_at' => '2026-09-24 11:00:00',
            'revised_by' => $rfah->id,
        ])->load('submittedBy', 'checkedBy', 'rlhApprovedBy', 'revisedBy');

        $stamps = app(BiayaRetribusiController::class)->resolveStamps($biaya);

        $this->assertSame('REVISI', $stamps['RFAH*']['text']);
        $this->assertSame('DISETUJUI RLH', $stamps['Menyetujui']['text']);
    }

    public function test_blade_catatan_revisi_muncul_walau_cap_berada_di_kotak_mengetahui(): void
    {
        $user = $this->user('admin_master', 'Admin Stamp');
        $biayaThl = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-17',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'created_by' => $user->id,
        ]);
        $thlDetail = BiayaThlDetail::create([
            'biaya_thl_id' => $biayaThl->id,
            'nama_thl' => 'Budi',
            'nopol_kendaraan' => 'KB 1234 XX',
            'type_kendaraan' => 'CDD',
            'kubikasi' => 7.1,
            'droppoint' => '36',
            'posisi' => 'THL HELPER',
            'jam_datang' => '2026-09-17 08:00:00',
            'jam_pulang' => '2026-09-17 19:00:00',
            'nominal_biaya' => 131000,
        ]);
        $biayaRetribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-17',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'approval_pengajuan' => 'Admin Stamp',
            'approval_pengajuan_level' => 'admin_master',
            'created_by' => $user->id,
        ]);
        $biayaRetribusi->details()->create([
            'biaya_thl_id' => $biayaThl->id,
            'biaya_thl_detail_id' => $thlDetail->id,
            'nopol_kendaraan' => 'KB 1234 XX',
            'type_kendaraan' => 'CDD',
            'no_surat_jalan' => 'SJ-001',
            'nominal_biaya' => 131000,
        ]);
        $biayaRetribusi->revisi_reason = 'Foto belum lengkap';

        $html = view('pdf.biaya_retribusi_combined', [
            'biayaRetribusi' => $biayaRetribusi->load('details.biayaThlDetail.photos', 'documents'),
            'approvalSections' => [
                ['title' => 'Mengajukan', 'people' => [['name' => 'Admin Stamp', 'role' => 'BLC']]],
                ['title' => 'Mengetahui', 'people' => [['name' => 'Bac User', 'role' => 'BAC']]],
                ['title' => 'Menyetujui', 'people' => [['name' => 'Rlh User', 'role' => 'RLH']]],
            ],
            'stamps' => [
                'Mengajukan' => [
                    'text' => 'PENGAJUAN',
                    'color' => '#dc2626',
                    'date' => '24 Sep 2026',
                ],
                'Mengetahui' => [
                    'text' => 'REVISI',
                    'color' => '#d97706',
                    'date' => '24 Sep 2026',
                ],
            ],
        ])->render();

        $this->assertStringContainsString('REVISI — Foto belum lengkap', $html);
        $this->assertStringContainsString('stamp-orange', $html);
    }

    public function test_blade_thl_menampilkan_semua_sj_tambahan_tanpa_double(): void
    {
        // Regresi: blade memakai pluck('sj') padahal kolomnya `no_sj` —
        // SJ kendaraan ke-2+ hilang dari PDF server. Setelah perbaiki,
        // ketiga SJ (utama + 2 tambahan) muncul tepat 1x di sel ringkasan.
        $user = $this->user('admin_master', 'Admin Blade');
        $biayaThl = BiayaThl::create([
            'tanggal_pengajuan' => '2026-10-16',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'created_by' => $user->id,
        ]);
        $thlDetail = BiayaThlDetail::create([
            'biaya_thl_id' => $biayaThl->id,
            'no_surat_jalan' => 'SJ-587',
            'nama_thl' => 'Juyanto',
            'nopol_kendaraan' => 'KB 9317 D',
            'type_kendaraan' => 'CDD',
            'posisi' => 'THL GUDANG',
            'jam_datang' => '2026-10-16 08:00:00',
            'jam_pulang' => '2026-10-16 19:00:00',
            'nominal_biaya' => 131000,
            'kendaraan_tambahan' => true,
            'kendaraan_sj' => 'SJ-589',
            'kendaraan_nopol' => 'KB 8340 CF',
            'kendaraan_type' => 'CDD',
        ]);
        $thlDetail->vehicles()->create(['no_sj' => 'SJ-589', 'nopol' => 'KB 8340 CF', 'type' => 'CDD', 'order' => 0]);
        $thlDetail->vehicles()->create(['no_sj' => 'SJ-588', 'nopol' => 'B 9614 SCN', 'type' => 'CDD', 'order' => 1]);
        $biayaRetribusi = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-10-16',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'approval_pengajuan' => 'Admin Blade',
            'approval_pengajuan_level' => 'admin_master',
            'created_by' => $user->id,
        ]);
        $biayaRetribusi->details()->create([
            'biaya_thl_id' => $biayaThl->id,
            'biaya_thl_detail_id' => $thlDetail->id,
            'nopol_kendaraan' => 'KB 9317 D',
            'type_kendaraan' => 'CDD',
            'no_surat_jalan' => 'SJ-587',
            'nominal_biaya' => 131000,
        ]);

        $html = view('pdf.biaya_retribusi_combined', [
            'biayaRetribusi' => $biayaRetribusi->load('details.biayaThlDetail.vehicles', 'documents'),
            'approvalSections' => [
                ['title' => 'Mengajukan', 'people' => [['name' => 'Admin Blade', 'role' => 'BLC']]],
                ['title' => 'Mengetahui', 'people' => [['name' => 'Bac User', 'role' => 'BAC']]],
                ['title' => 'Menyetujui', 'people' => [['name' => 'Rlh User', 'role' => 'RLH']]],
            ],
            'stamps' => [],
        ])->render();

        foreach (['SJ-587', 'SJ-589', 'SJ-588'] as $sj) {
            $this->assertSame(1, substr_count($html, $sj), "SJ {$sj} harus muncul tepat 1x (tidak hilang, tidak double)");
        }
        foreach (['KB 9317 D', 'KB 8340 CF', 'B 9614 SCN'] as $nopol) {
            $this->assertStringContainsString($nopol, $html);
        }
    }

    public function test_thl_revisi_oleh_rfah_nama_rfah_masuk_kotak_rfah_bukan_menyetujui(): void
    {
        $rlh = $this->user('rlh', 'Rlh User');
        $rfah = $this->user('rfah', 'Rfah User');
        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'is_rfah_required' => true,
            'rfah_name' => 'Rfah User',
            'created_by' => $rlh->id,
            'status' => 'revisi',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $rlh->id,
            'checked_at' => '2026-09-24 10:30:00',
            'checked_by' => $rlh->id,
            'rlh_approved_at' => '2026-09-24 10:45:00',
            'rlh_approved_by' => $rlh->id,
            'revised_at' => '2026-09-24 11:00:00',
            'revised_by' => $rfah->id,
        ])->load('submittedBy', 'checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy');

        $names = app(BiayaThlController::class)->approvalActorNames($biaya);

        $this->assertSame('Rlh User', $names['submitter']);
        $this->assertSame('Rlh User', $names['checker']);
        $this->assertNull($names['approver']);
        $this->assertSame('Rfah User', $names['rfah']);
    }

    public function test_thl_approved_rfah_nama_rlh_dan_rfah_ke_kotak_masing_masing(): void
    {
        $rlh = $this->user('rlh', 'Rlh User');
        $rfah = $this->user('rfah', 'Rfah User');
        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'is_rfah_required' => true,
            'rfah_name' => 'Rfah User',
            'created_by' => $rlh->id,
            'status' => 'approved',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $rlh->id,
            'checked_at' => '2026-09-24 10:30:00',
            'checked_by' => $rlh->id,
            'rlh_approved_at' => '2026-09-24 10:45:00',
            'rlh_approved_by' => $rlh->id,
            'approved_at' => '2026-09-24 11:00:00',
            'approved_by' => $rfah->id,
        ])->load('submittedBy', 'checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy');

        $names = app(BiayaThlController::class)->approvalActorNames($biaya);

        $this->assertSame('Rlh User', $names['submitter']);
        $this->assertSame('Rlh User', $names['approver']);
        $this->assertSame('Rfah User', $names['rfah']);
    }

    public function test_thl_revisi_oleh_bac_nama_bac_masuk_kotak_mengetahui(): void
    {
        $bac = $this->user('bac', 'Bac User');
        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'created_by' => $bac->id,
            'status' => 'revisi',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $bac->id,
            'revised_at' => '2026-09-24 11:00:00',
            'revised_by' => $bac->id,
        ])->load('submittedBy', 'checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy');

        $names = app(BiayaThlController::class)->approvalActorNames($biaya);

        $this->assertSame('Bac User', $names['submitter']);
        $this->assertSame('Bac User', $names['checker']);
        $this->assertNull($names['approver']);
        $this->assertNull($names['rfah']);
    }

    public function test_thl_ditolak_oleh_rlh_nama_rlh_tetap_di_kotak_menyetujui(): void
    {
        $rlh = $this->user('rlh', 'Rlh User');
        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'created_by' => $rlh->id,
            'status' => 'rejected',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $rlh->id,
            'checked_at' => '2026-09-24 10:30:00',
            'checked_by' => $rlh->id,
            'rejected_at' => '2026-09-24 11:00:00',
            'rejected_by' => $rlh->id,
            'rejection_reason' => 'Nominal tidak sesuai',
        ])->load('submittedBy', 'checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy');

        $names = app(BiayaThlController::class)->approvalActorNames($biaya);

        $this->assertSame('Rlh User', $names['approver']);
        $this->assertSame('Rlh User', $names['checker']);
    }

    public function test_retribusi_approved_rfah_nama_rlh_dan_rfah_di_kotak_masing_masing(): void
    {
        $bac = $this->user('bac', 'Bac Retribusi');
        $rlh = $this->user('rlh', 'Rlh Retribusi');
        $rfah = $this->user('rfah', 'Rfah Retribusi');
        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'is_rfah_required' => true,
            'rfah_name' => 'Rfah Retribusi',
            'approval_pengajuan' => 'Pengaju Depo',
            'created_by' => $bac->id,
            'status' => 'approved',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $bac->id,
            'checked_at' => '2026-09-24 10:30:00',
            'checked_by' => $bac->id,
            'rlh_approved_at' => '2026-09-24 10:45:00',
            'rlh_approved_by' => $rlh->id,
            'approved_at' => '2026-09-24 11:00:00',
            'approved_by' => $rfah->id,
        ])->load('checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy');

        $names = app(BiayaRetribusiController::class)->approvalActorNames($biaya);

        $this->assertSame('Pengaju Depo', $names['submitter']);
        $this->assertSame('Bac Retribusi', $names['checker']);
        $this->assertSame('Rlh Retribusi', $names['approver']);
        $this->assertSame('Rfah Retribusi', $names['rfah']);
    }

    public function test_retribusi_revisi_oleh_bac_nama_bac_masuk_kotak_mengetahui(): void
    {
        $bac = $this->user('bac', 'Bac Retribusi');
        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'approval_pengajuan' => 'Pengaju Depo',
            'created_by' => $bac->id,
            'status' => 'revisi',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $bac->id,
            'revised_at' => '2026-09-24 11:00:00',
            'revised_by' => $bac->id,
        ])->load('checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy');

        $names = app(BiayaRetribusiController::class)->approvalActorNames($biaya);

        $this->assertSame('Pengaju Depo', $names['submitter']);
        $this->assertSame('Bac Retribusi', $names['checker']);
        $this->assertNull($names['approver']);
        $this->assertNull($names['rfah']);
    }

    public function test_retribusi_rlh_approved_nama_rlh_di_kotak_menyetujui(): void
    {
        $bac = $this->user('bac', 'Bac Retribusi');
        $rlh = $this->user('rlh', 'Rlh Retribusi');
        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-09-24',
            'kode_depo' => 'DPS',
            'nama_depo' => 'Depo Singkawang',
            'nominal_biaya' => 131000,
            'is_rfah_required' => true,
            'rfah_name' => 'Rfah Retribusi',
            'approval_pengajuan' => 'Pengaju Depo',
            'created_by' => $bac->id,
            'status' => 'rlh_approved',
            'submitted_at' => '2026-09-24 10:00:00',
            'submitted_by' => $bac->id,
            'checked_at' => '2026-09-24 10:30:00',
            'checked_by' => $bac->id,
            'rlh_approved_at' => '2026-09-24 10:45:00',
            'rlh_approved_by' => $rlh->id,
        ])->load('checkedBy', 'rlhApprovedBy', 'approvedBy', 'rejectedBy', 'revisedBy');

        $names = app(BiayaRetribusiController::class)->approvalActorNames($biaya);

        $this->assertSame('Rlh Retribusi', $names['approver']);
        $this->assertNull($names['rfah']);
    }
}
