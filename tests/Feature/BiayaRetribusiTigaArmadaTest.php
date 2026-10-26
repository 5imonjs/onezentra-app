<?php

namespace Tests\Feature;

use App\Models\BiayaRetribusi;
use App\Models\BiayaRetribusiDocument;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Biaya\BiayaApprovalPresenter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Audit 3 armada pada pengajuan biaya retribusi: 1 baris = 1 kendaraan,
 * ketiga-tiganya harus tersimpan, terhitung, dan tampil tepat 1x di PDF
 * (tidak hilang, tidak double).
 */
class BiayaRetribusiTigaArmadaTest extends TestCase
{
    use RefreshDatabase;

    private function master(): User
    {
        $permissions = collect([
            ['biaya_retribusi.create', 'Create'],
            ['biaya_retribusi.view', 'View'],
            ['biaya_retribusi.edit', 'Edit'],
            ['biaya_retribusi.delete', 'Delete'],
            ['depot.view_all', 'Akses Semua Depo'],
        ])->map(fn (array $permission): Permission => Permission::firstOrCreate(
            ['slug' => $permission[0]],
            ['name' => $permission[1], 'menu_group' => 'Test'],
        ));
        $role = Role::firstOrCreate(['slug' => 'tiga_armada'], ['name' => 'Tiga Armada']);
        $role->permissions()->syncWithoutDetaching($permissions->pluck('id'));
        $user = User::factory()->create(['level' => 'admin_master', 'status' => 'active']);
        $role->users()->attach($user->id);

        return $user;
    }

    /** @return array<int, array<string, mixed>> */
    private function tigaBaris(): array
    {
        return [
            ['nopol_kendaraan' => 'KB 9317 D', 'type_kendaraan' => 'CDD', 'no_surat_jalan' => 'SJ-587', 'nominal_biaya' => 131000],
            ['nopol_kendaraan' => 'KB 8340 CF', 'type_kendaraan' => 'CDD', 'no_surat_jalan' => 'SJ-589', 'nominal_biaya' => 132000],
            ['nopol_kendaraan' => 'B 9614 SCN', 'type_kendaraan' => 'CDD', 'no_surat_jalan' => 'SJ-588', 'nominal_biaya' => 133000],
        ];
    }

    public function test_store_tiga_armada_menyimpan_tiga_baris_dan_total_benar(): void
    {
        Sanctum::actingAs($this->master());

        $response = $this->postJson('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-10-16',
            'details' => $this->tigaBaris(),
        ]);

        $response->assertCreated();
        $id = $response->json('data.id');
        $this->assertSame(3, BiayaRetribusi::findOrFail($id)->details()->count());
        $this->assertSame(396000.0, (float) BiayaRetribusi::findOrFail($id)->nominal_biaya);
        $this->assertSame('SJ-587', BiayaRetribusi::findOrFail($id)->details()->orderBy('order')->first()->no_surat_jalan);
    }

    public function test_blade_tiga_armada_muncul_tepat_satu_kali_tanpa_double(): void
    {
        $user = $this->master();
        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-10-16',
            'kode_depo' => $user->kode_depo,
            'nama_depo' => $user->nama_depo,
            'nominal_biaya' => 396000,
            'approval_pengajuan' => $user->full_name,
            'approval_pengajuan_level' => 'admin_master',
            'created_by' => $user->id,
        ]);
        foreach ($this->tigaBaris() as $index => $row) {
            $biaya->details()->create(array_merge($row, ['order' => $index]));
        }

        $html = view('pdf.biaya_retribusi', [
            'biayaRetribusi' => $biaya->load('details', 'documents'),
            'approvalSections' => [
                ['title' => 'Mengajukan', 'people' => [['name' => $user->full_name, 'role' => 'BLC']]],
                ['title' => 'Mengetahui', 'people' => [['name' => '-', 'role' => 'BAC']]],
                ['title' => 'Menyetujui', 'people' => [['name' => '-', 'role' => 'RLH']]],
            ],
            'stamps' => app(BiayaApprovalPresenter::class)->resolveRetribusi($biaya),
        ])->render();

        foreach (['SJ-587', 'SJ-589', 'SJ-588', 'KB 9317 D', 'KB 8340 CF', 'B 9614 SCN'] as $token) {
            $this->assertSame(1, substr_count($html, $token), "{$token} harus muncul tepat 1x");
        }
    }

    public function test_sj_sama_antar_baris_tetap_diperbolehkan(): void
    {
        Sanctum::actingAs($this->master());
        $rows = $this->tigaBaris();
        $rows[1]['no_surat_jalan'] = 'SJ-587';

        $this->postJson('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-10-16',
            'details' => $rows,
        ])->assertCreated();
    }

    public function test_store_manual_tiga_baris_empat_dokumen_pdf(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->master());

        $payload = [
            'tanggal_pengajuan' => '2026-10-16',
            'details' => $this->tigaBaris(),
        ];
        $types = ['SJ', 'SJ', 'SJ', 'BA'];
        foreach (range(0, 3) as $i) {
            $payload['files'][$i] = UploadedFile::fake()->create("sj-{$i}.pdf", 100, 'application/pdf');
            $payload['documents'][$i] = ['document_type' => $types[$i]];
        }

        $response = $this->post('/api/v1/biaya-retribusi', $payload);

        $response->assertCreated();
        $id = $response->json('data.id');
        $biaya = BiayaRetribusi::findOrFail($id);
        $this->assertSame(3, $biaya->details()->count());
        $this->assertSame(4, $biaya->documents()->count());
        $this->assertSame(['SJ', 'SJ', 'SJ', 'BA'], $biaya->documents()->orderBy('order')->pluck('document_type')->all());
        foreach ($biaya->documents as $doc) {
            Storage::disk('public')->assertExists($doc->file_path);
        }
    }

    public function test_store_menolak_file_path_kiriman_klien(): void
    {
        Sanctum::actingAs($this->master());

        $this->postJson('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-10-16',
            'details' => $this->tigaBaris(),
            'documents' => [
                ['document_type' => 'BA', 'file_path' => 'biaya_retribusi/999/rahasia.pdf'],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors('documents.0.file_path');
    }

    public function test_document_menolak_path_di_luar_folder_pengajuan(): void
    {
        Storage::fake('public');
        $user = $this->master();
        Sanctum::actingAs($user);

        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-10-16',
            'kode_depo' => $user->kode_depo,
            'nama_depo' => $user->nama_depo,
            'nominal_biaya' => 1000,
            'created_by' => $user->id,
        ]);
        $path = 'biaya_retribusi/999/rahasia.pdf';
        Storage::disk('public')->put($path, 'rahasia');
        $document = $biaya->documents()->create([
            'document_type' => 'BA',
            'file_path' => $path,
            'file_name' => 'rahasia.pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 7,
            'order' => 0,
        ]);

        $this->getJson("/api/v1/biaya-retribusi/documents/{$document->id}")->assertNotFound();
        $this->getJson("/api/v1/storage/{$path}")->assertNotFound();
    }

    public function test_destroy_tidak_menghapus_file_di_luar_folder_pengajuan(): void
    {
        Storage::fake('public');
        $user = $this->master();
        Sanctum::actingAs($user);

        $biaya = BiayaRetribusi::create([
            'tanggal_pengajuan' => '2026-10-16',
            'kode_depo' => $user->kode_depo,
            'nama_depo' => $user->nama_depo,
            'nominal_biaya' => 1000,
            'created_by' => $user->id,
        ]);
        $victimPath = 'validation-photos/milik-depo-lain.jpg';
        Storage::disk('public')->put($victimPath, 'foto');
        BiayaRetribusiDocument::create([
            'biaya_retribusi_id' => $biaya->id,
            'document_type' => 'BA',
            'file_path' => $victimPath,
            'file_name' => 'milik-depo-lain.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 4,
            'order' => 0,
        ]);

        $this->deleteJson("/api/v1/biaya-retribusi/{$biaya->id}")->assertOk();

        Storage::disk('public')->assertExists($victimPath);
    }
}
