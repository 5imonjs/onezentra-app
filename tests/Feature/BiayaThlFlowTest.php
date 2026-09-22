<?php

namespace Tests\Feature;

use App\Models\ApprovalAssignment;
use App\Models\BiayaThl;
use App\Models\BiayaThlPhoto;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BiayaThlFlowTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'biaya_thl_admin'], ['name' => 'Biaya THL Admin']);
        foreach (['biaya_thl.view', 'biaya_thl.create', 'biaya_thl.edit', 'biaya_thl.delete', 'approval.submit'] as $slug) {
            $permission = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Biaya']);
            $role->permissions()->syncWithoutDetaching([$permission->id]);
        }

        $this->user = User::create([
            'email' => 'biaya-thl@test.com',
            'password' => 'password',
            'full_name' => 'Biaya THL User',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'admin_master',
            'status' => 'active',
            'role_id' => $role->id,
        ]);
        $role->users()->attach($this->user->id);
    }

    public function test_index_returns_server_summary_over_full_filter(): void
    {
        Sanctum::actingAs($this->user);

        BiayaThl::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'created_by' => $this->user->id, 'status' => 'pending', 'nominal_biaya' => 100000]);
        BiayaThl::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'created_by' => $this->user->id, 'status' => 'approved', 'nominal_biaya' => 200000]);
        BiayaThl::create(['tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A', 'created_by' => $this->user->id, 'status' => 'rejected', 'nominal_biaya' => 50000]);

        $res = $this->getJson('/api/v1/biaya-thl?per_page=2&page=1')->assertOk();

        $this->assertCount(2, $res->json('data'));
        $this->assertSame(3, $res->json('summary.total'));
        $this->assertEquals(350000, $res->json('summary.total_nominal'));
        $this->assertSame(1, $res->json('summary.pending'));
        $this->assertSame(1, $res->json('summary.approved'));
        $this->assertSame(1, $res->json('summary.rejected'));
    }

    public function test_store_uses_assigned_rfah_per_depot_with_global_fallback(): void
    {
        Sanctum::actingAs($this->user);

        $approver = User::create([
            'email' => 'rfah-dpta@test.com',
            'password' => 'password',
            'full_name' => 'RFAH Depo A',
            'kode_depo' => 'DPT-A',
            'nama_depo' => 'Depo A',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        ApprovalAssignment::create([
            'kode_depo' => 'DPT-A', 'approval_level' => 'RFAH', 'user_id' => $approver->id, 'is_active' => true,
        ]);

        $payload = fn (string $sj) => [
            'tanggal_pengajuan' => '2026-09-18',
            'details' => [[
                'no_surat_jalan' => $sj,
                'nama_thl' => 'Budi',
                'driver_name' => 'Andi',
                'nopol_kendaraan' => 'KB 1 X',
                'type_kendaraan' => 'CDD',
                'nominal_biaya' => 900000,
                'kubikasi' => 1.5,
                'droppoint' => 'Terminal A',
                'posisi' => 'THL HELPER',
                'jam_datang' => '2026-09-18T08:00',
                'jam_pulang' => '2026-09-18T17:00',
                'order' => 0,
            ]],
        ];

        // Depo ber-assignment: nama dari user RFAH.
        $this->postJson('/api/v1/biaya-thl', $payload('SJ-ASN'))->assertCreated();
        $this->assertDatabaseHas('biaya_thls', ['rfah_name' => 'RFAH Depo A']);

        // Nonaktifkan assignment: jatuh ke config global.
        ApprovalAssignment::query()->update(['is_active' => false]);
        $this->postJson('/api/v1/biaya-thl', $payload('SJ-FB'))->assertCreated();
        $this->assertDatabaseHas('biaya_thls', [
            'rfah_name' => config('biaya.rfah_name'),
        ]);
    }

    public function test_draft_saves_incomplete_and_submit_guards_completeness(): void
    {
        Sanctum::actingAs($this->user);

        // Simpan draft apa adanya: tanpa tanggal, tanpa pekerja.
        $draft = $this->postJson('/api/v1/biaya-thl', ['is_draft' => true])->assertCreated();
        $this->assertSame('draft', $draft->json('data.status'));

        // Draft tak lengkap tidak boleh masuk antrean.
        $this->postJson("/api/v1/biaya-thl/{$draft->json('data.id')}/submit")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['tanggal_pengajuan', 'details']);

        // Lengkapi via update biasa lalu kirim: lolos.
        $this->putJson("/api/v1/biaya-thl/{$draft->json('data.id')}", [
            'tanggal_pengajuan' => '2026-09-18',
            'details' => [[
                'no_surat_jalan' => 'SJ-D1',
                'nama_thl' => 'Budi',
                'driver_name' => 'Andi',
                'nopol_kendaraan' => 'KB 1 X',
                'type_kendaraan' => 'CDD',
                'nominal_biaya' => 150000,
                'kubikasi' => 1.5,
                'droppoint' => 'Terminal A',
                'posisi' => 'THL HELPER',
                'jam_datang' => '2026-09-18T08:00',
                'jam_pulang' => '2026-09-18T17:00',
                'order' => 0,
            ]],
        ])->assertOk();
        $detail = BiayaThl::find($draft->json('data.id'))->details()->first();
        BiayaThlPhoto::create([
            'biaya_thl_id' => $draft->json('data.id'),
            'biaya_thl_detail_id' => $detail->id,
            'file_path' => 'biaya_thl/test/bukti.jpg',
            'file_name' => 'bukti.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'order' => 0,
        ]);
        $this->postJson("/api/v1/biaya-thl/{$draft->json('data.id')}/submit")->assertOk();
    }

    public function test_submit_rejects_details_without_proof_photo(): void
    {
        Sanctum::actingAs($this->user);

        $create = $this->postJson('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-22',
            'details' => [[
                'no_surat_jalan' => 'SJ-G1',
                'nama_thl' => 'JUYANTO',
                'nopol_kendaraan' => 'KB 1234 XX',
                'type_kendaraan' => 'CDD',
                'posisi' => 'THL GUDANG',
                'nominal_biaya' => 131000,
                'jam_datang' => '2026-09-22T05:06',
                'jam_pulang' => '2026-09-22T17:06',
                'order' => 0,
            ]],
        ])->assertCreated();

        // Baris lengkap tanpa foto bukti tetap tidak boleh dikirim.
        $this->postJson("/api/v1/biaya-thl/{$create->json('data.id')}/submit")
            ->assertStatus(422)
            ->assertJsonValidationErrors('details.0.photos');
    }

    public function test_submit_accepts_gudang_details_with_per_row_vehicle(): void
    {
        Sanctum::actingAs($this->user);

        $create = $this->postJson('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-22',
            'details' => [
                [
                    'no_surat_jalan' => 'SJ-G1',
                    'nama_thl' => 'JUYANTO',
                    'nopol_kendaraan' => 'KB 1234 XX',
                    'type_kendaraan' => 'CDD',
                    'posisi' => 'THL GUDANG',
                    'nominal_biaya' => 131000,
                    'jam_datang' => '2026-09-22T05:06',
                    'jam_pulang' => '2026-09-22T17:06',
                    'order' => 0,
                ],
                [
                    'no_surat_jalan' => 'SJ-G1',
                    'nama_thl' => 'AUFA',
                    'nopol_kendaraan' => 'KB 1234 XX',
                    'type_kendaraan' => 'CDD',
                    'posisi' => 'THL GUDANG',
                    'nominal_biaya' => 131000,
                    'jam_datang' => '2026-09-22T05:06',
                    'jam_pulang' => '2026-09-22T17:06',
                    'order' => 1,
                ],
            ],
        ])->assertCreated();

        // Foto bukti per baris (aturan §2.1 langkah 6) sebelum kirim.
        foreach (BiayaThl::find($create->json('data.id'))->details as $i => $row) {
            BiayaThlPhoto::create([
                'biaya_thl_id' => $create->json('data.id'),
                'biaya_thl_detail_id' => $row->id,
                'file_path' => "biaya_thl/test/bukti-{$i}.jpg",
                'file_name' => "bukti-{$i}.jpg",
                'mime_type' => 'image/jpeg',
                'file_size' => 1024,
                'order' => 0,
            ]);
        }

        // Dokumentasi: GUDANG membawa plat/type per baris seperti posisi lain.
        $this->postJson("/api/v1/biaya-thl/{$create->json('data.id')}/submit")->assertOk();
        $this->assertSame('pending', BiayaThl::find($create->json('data.id'))->status);
    }

    public function test_draft_save_rejected_on_in_flight_record(): void
    {
        Sanctum::actingAs($this->user);

        $biaya = BiayaThl::create([
            'tanggal_pengajuan' => '2026-09-18', 'kode_depo' => 'DPT-A', 'nama_depo' => 'Depo A',
            'created_by' => $this->user->id, 'status' => 'pending',
        ]);

        $this->putJson("/api/v1/biaya-thl/{$biaya->id}", ['is_draft' => true])->assertStatus(422);
    }

    public function test_store_requires_kendaraan_sj_when_tambahan_flagged(): void
    {
        Sanctum::actingAs($this->user);

        $detail = [
            'no_surat_jalan' => 'SJ-K1',
            'nama_thl' => 'Gudang',
            'nopol_kendaraan' => 'KB 9 X',
            'type_kendaraan' => 'Box',
            'nominal_biaya' => 100000,
            'posisi' => 'THL GUDANG',
            'jam_datang' => '2026-09-18T08:00',
            'jam_pulang' => '2026-09-18T17:00',
            'kendaraan_tambahan' => true,
            'order' => 0,
        ];

        $this->postJson('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-18',
            'details' => [$detail],
        ])->assertStatus(422)->assertJsonValidationErrors('details.0.kendaraan_sj');

        $detail['kendaraan_sj'] = 'SJ-LAIN-99';
        $detail['kendaraan_nopol'] = 'KB 10 X';
        $detail['kendaraan_type'] = 'CDD';
        $this->postJson('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-18',
            'details' => [$detail],
        ])->assertCreated();

        $this->assertDatabaseHas('biaya_thl_details', [
            'no_surat_jalan' => 'SJ-K1',
            'kendaraan_sj' => 'SJ-LAIN-99',
            'kendaraan_nopol' => 'KB 10 X',
            'kendaraan_type' => 'CDD',
        ]);

        // Baris utama (nopol/type per baris) tidak tertimpa kendaraan tambahan.
        $this->assertDatabaseHas('biaya_thl_details', [
            'no_surat_jalan' => 'SJ-K1',
            'nopol_kendaraan' => 'KB 9 X',
            'type_kendaraan' => 'Box',
        ]);
    }

    public function test_submit_accepts_complete_tambahan_vehicle(): void
    {
        Sanctum::actingAs($this->user);

        $create = $this->postJson('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-22',
            'details' => [[
                'no_surat_jalan' => 'SJ-G1',
                'nama_thl' => 'JUYANTO',
                'nopol_kendaraan' => 'KB 1111 AA',
                'type_kendaraan' => 'CDD',
                'posisi' => 'THL GUDANG',
                'nominal_biaya' => 131000,
                'jam_datang' => '2026-09-22T05:06',
                'jam_pulang' => '2026-09-22T17:06',
                'kendaraan_tambahan' => true,
                'kendaraan_sj' => 'SJ-G2',
                'kendaraan_nopol' => 'KB 2222 BB',
                'kendaraan_type' => 'Fuso',
                'order' => 0,
            ]],
        ])->assertCreated();

        $row = BiayaThl::find($create->json('data.id'))->details()->first();
        BiayaThlPhoto::create([
            'biaya_thl_id' => $create->json('data.id'),
            'biaya_thl_detail_id' => $row->id,
            'file_path' => 'biaya_thl/test/absen.jpg',
            'file_name' => 'absen.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
            'order' => 0,
        ]);

        $this->postJson("/api/v1/biaya-thl/{$create->json('data.id')}/submit")->assertOk();
    }

    public function test_store_rejects_pulang_before_datang(): void
    {
        Sanctum::actingAs($this->user);

        $this->postJson('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-18',
            'details' => [[
                'no_surat_jalan' => 'SJ-JAM',
                'nama_thl' => 'Budi',
                'driver_name' => 'Andi',
                'nopol_kendaraan' => 'KB 1 X',
                'type_kendaraan' => 'CDD',
                'nominal_biaya' => 100000,
                'kubikasi' => 1.5,
                'droppoint' => 'Terminal A',
                'posisi' => 'THL HELPER',
                'jam_datang' => '2026-09-18T17:00',
                'jam_pulang' => '2026-09-18T08:00',
                'order' => 0,
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors('details.0.jam_pulang');
    }

    public function test_update_preserves_existing_photos_until_removed(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->user);

        $file = UploadedFile::fake()->image('bukti.jpg');
        $create = $this->post('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-18',
            'details' => [[
                'no_surat_jalan' => 'SJ-F1',
                'nama_thl' => 'Budi',
                'driver_name' => 'Andi',
                'nopol_kendaraan' => 'KB 1 X',
                'type_kendaraan' => 'CDD',
                'nominal_biaya' => 150000,
                'kubikasi' => 1.5,
                'droppoint' => 'Terminal A',
                'posisi' => 'THL HELPER',
                'jam_datang' => '2026-09-18T08:00',
                'jam_pulang' => '2026-09-18T17:00',
                'order' => 0,
                'photos' => [$file],
            ]],
        ])->assertCreated();

        $id = $create->json('data.id');
        $detailId = $create->json('data.details.0.id');
        $photo = BiayaThlPhoto::firstWhere('biaya_thl_detail_id', $detailId);
        $this->assertNotNull($photo);
        Storage::disk('public')->assertExists($photo->file_path);

        $fields = [
            'id' => $detailId,
            'tanggal_pengajuan' => '2026-09-18',
            'no_surat_jalan' => 'SJ-F1',
            'nama_thl' => 'Budi',
            'driver_name' => 'Andi',
            'nopol_kendaraan' => 'KB 1 X',
            'type_kendaraan' => 'CDD',
            'nominal_biaya' => 160000,
            'kubikasi' => 1.5,
            'droppoint' => 'Terminal A',
            'posisi' => 'THL HELPER',
            'jam_datang' => '2026-09-18T08:00',
            'jam_pulang' => '2026-09-18T17:00',
            'order' => 0,
        ];

        // Edit tanpa menyentuh foto: foto lama wajib bertahan.
        $this->putJson("/api/v1/biaya-thl/{$id}", [
            'tanggal_pengajuan' => '2026-09-18',
            'details' => [$fields],
        ])->assertOk();
        $this->assertDatabaseHas('biaya_thl_photos', ['id' => $photo->id]);
        Storage::disk('public')->assertExists($photo->file_path);

        // Hapus eksplisit: baris + file hilang.
        $fields['photos_remove'] = [$photo->id];
        $this->putJson("/api/v1/biaya-thl/{$id}", [
            'tanggal_pengajuan' => '2026-09-18',
            'details' => [$fields],
        ])->assertOk();
        $this->assertDatabaseMissing('biaya_thl_photos', ['id' => $photo->id]);
        Storage::disk('public')->assertMissing($photo->file_path);
    }

    public function test_draft_update_preserves_ids_and_photos_for_multiple_details(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->user);

        $create = $this->post('/api/v1/biaya-thl', [
            'is_draft' => '1',
            'tanggal_pengajuan' => '2026-09-22',
            'details' => [
                [
                    'no_surat_jalan' => 'SJ-DRAFT-1',
                    'nama_thl' => 'JUYANTO',
                    'posisi' => 'THL GUDANG',
                    'nominal_biaya' => 131000,
                    'jam_datang' => '2026-09-22T05:06',
                    'jam_pulang' => '2026-09-22T17:06',
                    'order' => 0,
                    'photos' => [$f1 = UploadedFile::fake()->image('a.jpg')],
                ],
                [
                    'no_surat_jalan' => 'SJ-DRAFT-1',
                    'nama_thl' => 'AUFA',
                    'posisi' => 'THL GUDANG',
                    'nominal_biaya' => 131000,
                    'jam_datang' => '2026-09-22T05:06',
                    'jam_pulang' => '2026-09-22T17:06',
                    'order' => 1,
                    'photos' => [$f2 = UploadedFile::fake()->image('b.jpg')],
                ],
            ],
        ])->assertCreated();

        $id = $create->json('data.id');
        $d0 = $create->json('data.details.0.id');
        $d1 = $create->json('data.details.1.id');
        $this->assertNotNull($d0);
        $this->assertNotNull($d1);
        $this->assertSame(2, BiayaThlPhoto::whereHas('detail', fn ($q) => $q->where('biaya_thl_id', $id))->count());

        // Simpan draft ulang tanpa foto baru (kasus FE: stored photo tidak
        // dikirim ulang sebagai file) — id wajib dipertahankan validator
        // agar sync tidak menganggap semua baris baru + menghapus foto lama.
        $this->post("/api/v1/biaya-thl/{$id}", [
            '_method' => 'PUT',
            'is_draft' => '1',
            'tanggal_pengajuan' => '2026-09-22',
            'details' => [
                [
                    'id' => $d0,
                    'no_surat_jalan' => 'SJ-DRAFT-1',
                    'nama_thl' => 'JUYANTO',
                    'posisi' => 'THL GUDANG',
                    'nominal_biaya' => 131000,
                    'jam_datang' => '2026-09-22T05:06',
                    'jam_pulang' => '2026-09-22T17:06',
                    'order' => 0,
                ],
                [
                    'id' => $d1,
                    'no_surat_jalan' => 'SJ-DRAFT-1',
                    'nama_thl' => 'AUFA',
                    'posisi' => 'THL GUDANG',
                    'nominal_biaya' => 131000,
                    'jam_datang' => '2026-09-22T05:06',
                    'jam_pulang' => '2026-09-22T17:06',
                    'order' => 1,
                ],
            ],
        ])->assertOk();

        $this->assertSame(2, BiayaThl::find($id)->details()->count());
        $this->assertSame(2, BiayaThlPhoto::whereHas('detail', fn ($q) => $q->where('biaya_thl_id', $id))->count());
        $this->assertDatabaseHas('biaya_thl_details', ['id' => $d0, 'nama_thl' => 'JUYANTO']);
        $this->assertDatabaseHas('biaya_thl_details', ['id' => $d1, 'nama_thl' => 'AUFA']);
    }

    public function test_store_rejects_gudang_without_vehicle_but_accepts_with_vehicle(): void
    {
        Sanctum::actingAs($this->user);

        $gudang = [
            'no_surat_jalan' => 'SJ-GUDANG',
            'nama_thl' => 'JUYANTO',
            'posisi' => 'THL GUDANG',
            'nominal_biaya' => 131000,
            'jam_datang' => '2026-09-22T05:06',
            'jam_pulang' => '2026-09-22T17:06',
            'order' => 0,
        ];

        // Dokumentasi: plat/type per baris wajib untuk GUDANG juga.
        $this->postJson('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-22',
            'details' => [$gudang],
        ])->assertStatus(422)->assertJsonValidationErrors('details.0.nopol_kendaraan');

        // GUDANG dengan kendaraan per baris wajib lolos.
        $this->postJson('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-22',
            'details' => [array_merge($gudang, [
                'nopol_kendaraan' => 'KB 1234 XX',
                'type_kendaraan' => 'CDD',
            ])],
        ])->assertCreated();

        // HELPER tanpa plat wajib ditolak.
        $this->postJson('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-22',
            'details' => [[
                'no_surat_jalan' => 'SJ-HELP',
                'nama_thl' => 'Budi',
                'driver_name' => 'Andi',
                'nominal_biaya' => 100000,
                'kubikasi' => 1.5,
                'droppoint' => 'Terminal A',
                'posisi' => 'THL HELPER',
                'jam_datang' => '2026-09-22T08:00',
                'jam_pulang' => '2026-09-22T17:00',
                'order' => 0,
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors('details.0.nopol_kendaraan');
    }

    public function test_store_rejects_zero_nominal(): void
    {
        Sanctum::actingAs($this->user);

        $this->postJson('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-18',
            'details' => [[
                'no_surat_jalan' => 'SJ-ZERO',
                'nama_thl' => 'Budi',
                'driver_name' => 'Andi',
                'nopol_kendaraan' => 'KB 1 X',
                'type_kendaraan' => 'CDD',
                'nominal_biaya' => 0,
                'kubikasi' => 1.5,
                'droppoint' => 'Terminal A',
                'posisi' => 'THL HELPER',
                'jam_datang' => '2026-09-18T08:00',
                'jam_pulang' => '2026-09-18T17:00',
                'order' => 0,
            ]],
        ])->assertStatus(422)->assertJsonValidationErrors('details.0.nominal_biaya');

        $this->assertDatabaseMissing('biaya_thls', ['tanggal_pengajuan' => '2026-09-18']);
    }

    public function test_store_uses_configured_rfah_name_and_threshold(): void
    {
        Sanctum::actingAs($this->user);
        Config::set('biaya.rfah_name', 'Approver Config');
        Config::set('biaya.thl_rfah_threshold', 1000000);

        $this->postJson('/api/v1/biaya-thl', [
            'tanggal_pengajuan' => '2026-09-18',
            'details' => [[
                'no_surat_jalan' => 'SJ-CFG',
                'nama_thl' => 'Budi',
                'nopol_kendaraan' => 'KB 1 X',
                'type_kendaraan' => 'CDD',
                'nominal_biaya' => 900000,
                'kubikasi' => 1.5,
                'droppoint' => 'Terminal A',
                'posisi' => 'THL HELPER',
                'driver_name' => 'Andi',
                'jam_datang' => '2026-09-18T08:00',
                'jam_pulang' => '2026-09-18T17:00',
                'order' => 0,
            ]],
        ])->assertCreated();

        // 900rb < ambang config 1jt -> tanpa RFAH.
        $this->assertDatabaseHas('biaya_thls', [
            'is_rfah_required' => false,
            'rfah_name' => null,
        ]);
    }

    public function test_store_accepts_thl_gudang_defaults_and_keeps_kubikasi_base_in_sync(): void
    {
        Sanctum::actingAs($this->user);

        $payload = [
            'tanggal_pengajuan' => '2026-09-17',
            'details' => [
                [
                    'no_surat_jalan' => 'SJ-001',
                    'nama_thl' => 'Budi',
                    'driver_name' => 'Andi',
                    'nopol_kendaraan' => 'KB 1234 XX',
                    'type_kendaraan' => 'CDD',
                    'nominal_biaya' => 150000,
                    'kubikasi' => 1.5,
                    'droppoint' => 'Terminal A',
                    'posisi' => 'THL HELPER',
                    'jam_datang' => '2026-09-17T08:00',
                    'jam_pulang' => '2026-09-17T17:00',
                    'kendaraan_tambahan' => false,
                    'order' => 0,
                ],
                [
                    'no_surat_jalan' => 'SJ-001',
                    'nama_thl' => 'Gudang',
                    'driver_name' => '',
                    'nopol_kendaraan' => 'KB 8888 ZZ',
                    'type_kendaraan' => 'Box',
                    'nominal_biaya' => 50000,
                    'kubikasi' => 0,
                    'droppoint' => '0',
                    'posisi' => 'THL GUDANG',
                    'jam_datang' => '2026-09-17T08:00',
                    'jam_pulang' => '2026-09-17T17:00',
                    'kendaraan_tambahan' => true,
                    'kendaraan_sj' => 'SJ-EXTRA-01',
                    'kendaraan_nopol' => 'KB 7777 YY',
                    'kendaraan_type' => 'Fuso',
                    'order' => 1,
                ],
            ],
        ];

        $response = $this->postJson('/api/v1/biaya-thl', $payload);

        $response->assertCreated();
        $this->assertEqualsWithDelta(1.5, (float) $response->json('data.kubikasi_base'), 0.001);
        $this->assertSame('0', $response->json('data.details.1.droppoint'));
        $this->assertSame(0.0, (float) $response->json('data.details.1.kubikasi'));
        $this->assertSame('2026-09-17T08:00', substr((string) $response->json('data.details.1.jam_datang'), 0, 16));
        $this->assertSame('2026-09-17T17:00', substr((string) $response->json('data.details.1.jam_pulang'), 0, 16));
        $this->assertDatabaseHas('biaya_thls', ['kubikasi_base' => '1.50']);
    }

    public function test_store_rejects_thl_gudang_without_work_hours(): void
    {
        Sanctum::actingAs($this->user);

        $payload = [
            'tanggal_pengajuan' => '2026-09-17',
            'details' => [
                [
                    'no_surat_jalan' => 'SJ-002',
                    'nama_thl' => 'Gudang',
                    'driver_name' => '',
                    'nopol_kendaraan' => 'KB 8888 ZZ',
                    'type_kendaraan' => 'Box',
                    'nominal_biaya' => 50000,
                    'kubikasi' => 0,
                    'droppoint' => '0',
                    'posisi' => 'THL GUDANG',
                    'jam_datang' => null,
                    'jam_pulang' => null,
                    'kendaraan_tambahan' => false,
                    'order' => 0,
                ],
            ],
        ];

        $response = $this->postJson('/api/v1/biaya-thl', $payload);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['details.0.jam_datang', 'details.0.jam_pulang']);
    }
}
