<?php

namespace Tests\Feature;

use App\Models\BiayaRetribusi;
use App\Models\BiayaThl;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiayaInputP0Test extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'biaya_p0_admin'], ['name' => 'Biaya P0 Admin']);
        foreach (['biaya_thl.view', 'biaya_thl.create', 'biaya_retribusi.view', 'biaya_retribusi.create'] as $slug) {
            $permission = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Biaya']);
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }

        $this->user = User::create([
            'email' => 'biaya-p0@test.com',
            'password' => 'password',
            'full_name' => 'Biaya P0 User',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'admin_master',
            'status' => 'active',
            'role_id' => $role->id,
        ]);
        $role->users()->attach($this->user->id);
    }

    public function test_thl_store_saves_kendaraan_array_and_mirrors_legacy(): void
    {
        Sanctum::actingAs($this->user);

        $create = $this->postJson('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-18',
            'details' => [[
                'no_surat_jalan' => 'SJ-G1',
                'nama_thl' => 'Gudang',
                'nopol_kendaraan' => 'KB 1111 AA',
                'type_kendaraan' => 'CDD',
                'posisi' => 'THL GUDANG',
                'nominal_biaya' => 150000,
                'jam_datang' => '2026-09-18T08:00',
                'jam_pulang' => '2026-09-18T17:00',
                'order' => 0,
                'kendaraan' => [
                    ['sj' => 'SJ-G2', 'nopol' => 'KB 2222 BB', 'type' => 'Fuso'],
                    ['sj' => 'SJ-G3', 'nopol' => 'KB 3333 CC', 'type' => 'CDD'],
                ],
            ]],
        ])->assertCreated();

        $id = $create->json('data.id');
        $detail = BiayaThl::find($id)->details()->first();

        $this->assertCount(2, $detail->vehicles);
        $this->assertSame('SJ-G2', $detail->vehicles[0]->no_sj);
        $this->assertSame('KB 3333 CC', $detail->vehicles[1]->nopol);

        // Mirror kendaraan pertama ke kolom legacy.
        $this->assertSame('SJ-G2', $detail->kendaraan_sj);
        $this->assertSame('KB 2222 BB', $detail->kendaraan_nopol);

        // Show menyertakan relasi vehicles (restor edit FE).
        $show = $this->getJson("/api/v1/biaya-thl/{$id}")->assertOk();
        $this->assertCount(2, $show->json('data.details.0.vehicles'));
    }

    public function test_retribusi_store_pairs_uploaded_file_with_document_type(): void
    {
        Sanctum::actingAs($this->user);
        Storage::fake('public');

        $file = UploadedFile::fake()->create('SJ-001.pdf', 100, 'application/pdf');

        $create = $this->post('/api/v1/biaya-retribusi', [
            'tanggal_pengajuan' => '2026-09-18',
            'details' => [[
                'nopol_kendaraan' => 'KB 1234 XX',
                'type_kendaraan' => 'CDD',
                'no_surat_jalan' => 'SJ-001',
                'nominal_biaya' => 500000,
                'order' => 0,
            ]],
            'documents' => [[
                'document_type' => 'SJ',
                'file_name' => 'SJ-001.pdf',
            ]],
            'files' => [$file],
        ])->assertCreated();

        $id = $create->json('data.id');
        $documents = BiayaRetribusi::find($id)->documents;

        // Tepat 1 dokumen (tanpa duplikat metadata) dengan tipe pilihan user.
        $this->assertCount(1, $documents);
        $this->assertSame('SJ', $documents[0]->document_type);
        $this->assertSame('SJ-001.pdf', $documents[0]->file_name);
    }
}
