<?php

namespace Tests\Feature;

use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDetail;
use App\Models\BiayaThl;
use App\Models\BiayaThlDetail;
use App\Models\BiayaThlPhoto;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BiayaPdfPhotoTest extends TestCase
{
    use RefreshDatabase;

    public function test_combined_pdf_embeds_photo_from_private_evidence_disk(): void
    {
        Storage::fake('public');

        $path = 'biaya_thl/1/detail_1/bukti.jpg';
        Storage::disk('public')->put($path, 'FAKE-JPEG');

        $thl = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-17',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 131000,
        ]);
        $thlDetail = BiayaThlDetail::create([
            'biaya_thl_id' => $thl->id,
            'nama_thl' => 'Budi',
            'nopol_kendaraan' => 'KB 1234 XX',
            'posisi' => 'THL HELPER',
            'nominal_biaya' => 131000,
        ]);
        BiayaThlPhoto::create([
            'biaya_thl_id' => $thl->id,
            'biaya_thl_detail_id' => $thlDetail->id,
            'file_path' => $path,
            'file_name' => 'bukti.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 9,
        ]);

        $retribusiDetail = new BiayaRetribusiDetail([
            'nopol_kendaraan' => 'KB 1234 XX',
            'no_surat_jalan' => 'SJ-001',
            'nominal_biaya' => 131000,
        ]);
        $retribusiDetail->setRelation('biayaThlDetail', $thlDetail->load('photos'));

        $retribusi = new BiayaRetribusi([
            'tanggal_pengajuan' => '2026-09-17',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'nominal_biaya' => 131000,
        ]);
        $retribusi->setRelation('details', collect([$retribusiDetail]));
        $retribusi->setRelation('documents', collect());

        $html = view('pdf.biaya_retribusi_combined', [
            'biayaRetribusi' => $retribusi,
            'approvalSections' => [],
            'stamps' => [],
            'logoData' => null,
            'rfahThreshold' => 750000,
        ])->render();

        $this->assertStringContainsString('data:image/jpeg;base64,'.base64_encode('FAKE-JPEG'), $html);
    }
}
