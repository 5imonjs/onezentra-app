<?php

namespace Tests\Feature;

use App\Mail\OpnameExpiredNotification;
use App\Models\ApprovalHistory;
use App\Models\Batch;
use App\Models\EmailRecipient;
use App\Models\OpnameExpiredSession;
use App\Models\OpnameExpiredWave;
use App\Models\Permission;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\User;
use App\Services\OpnameExpiredService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Sesi opname lapangan (aturan A2 + base praktik stock opname): supervisor
 * menugaskan wave ke petugas; petugas menghitung fisik + disposisi tiap
 * batch (penghitungan TIDAK menulis wave); sesi dikirim untuk persetujuan;
 * approver independen menyetujui — koreksi wave baru berlaku saat itu.
 */
class OpnameExpiredSessionTest extends TestCase
{
    use RefreshDatabase;

    private User $supervisor;

    private User $field;

    private User $approver;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo('2026-09-09 10:00:00');

        $role = Role::firstOrCreate(['slug' => 'opname_session_test'], ['name' => 'Opname Session Test']);
        foreach (['opname.view', 'opname.create', 'opname.edit', 'opname.session.view', 'opname.session.create', 'opname.session.edit', 'opname.session.approve'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->supervisor = User::create([
            'email' => 'opname-supervisor@test.com',
            'password' => 'password',
            'full_name' => 'Opname Supervisor',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $this->field = User::create([
            'email' => 'opname-field@test.com',
            'password' => 'password',
            'full_name' => 'Petugas Lapangan',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $this->approver = User::create([
            'email' => 'opname-approver@test.com',
            'password' => 'password',
            'full_name' => 'Approver Opname',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $role->users()->attach([$this->supervisor->id, $this->field->id, $this->approver->id]);
    }

    private function receipt(string $kode, float $qty, string $expired): ReceivingItem
    {
        return ReceivingItem::create([
            'source' => 'IMPORT_MANUAL',
            'kode_barang' => $kode,
            'nama_barang' => 'Produk '.$kode,
            'actual_qty' => $qty,
            'expected_qty' => $qty,
            'qty_pcs' => $qty,
            'satuan' => 'CRT',
            'expired_date' => $expired,
            'tanggal_penerimaan' => '2026-09-09',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'condition' => 'FISIK_BAGUS',
            'scanned_by' => $this->supervisor->id,
        ]);
    }

    private function makeSession(): OpnameExpiredSession
    {
        $this->receipt('B-SES-01', 10, '2027-02-01');
        $this->receipt('B-SES-02', 5, '2027-03-01');
        app(OpnameExpiredService::class)->generate();

        Sanctum::actingAs($this->supervisor);
        $waveIds = OpnameExpiredWave::where('week_start', '2026-09-07')->pluck('id')->all();

        $res = $this->postJson('/api/v1/opname-sessions', [
            'week_start' => '2026-09-07',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'assigned_to' => $this->field->id,
            'wave_ids' => $waveIds,
        ])->assertCreated();

        return OpnameExpiredSession::find($res->json('data.id'))->load('items.wave');
    }

    /**
     * Sesi sudah dimulai, kedua item dihitung, dan sesi dikirim —
     * kandidat siap approve.
     */
    private function countedAndSubmittedSession(): OpnameExpiredSession
    {
        $session = $this->makeSession();

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();

        foreach ($session->items as $si) {
            $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$si->id}", [
                'qty_fisik_crt' => 5,
                'qty_fisik_pcs' => 5,
                'identified_via' => 'scan',
                'condition' => 'FISIK_BAGUS',
                'disposition' => 'RETUR',
            ])->assertOk();
        }

        $this->postJson("/api/v1/opname-sessions/{$session->id}/submit")->assertOk();

        return $session->fresh()->load('items.wave');
    }

    public function test_officers_endpoint_lists_active_users_of_requested_depot(): void
    {
        User::create([
            'email' => 'opname-inactive@test.com',
            'password' => 'password',
            'full_name' => 'Petugas Nonaktif',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'inactive',
        ]);
        $other = User::create([
            'email' => 'opname-other@test.com',
            'password' => 'password',
            'full_name' => 'Petugas Depo Lain',
            'kode_depo' => 'LNY',
            'nama_depo' => 'Depo Lain',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);

        Sanctum::actingAs($this->supervisor);
        $res = $this->getJson('/api/v1/opname-sessions/officers?kode_depo=DPO')->assertOk();

        $ids = collect($res->json('data'))->pluck('id')->all();
        $this->assertContains($this->field->id, $ids);
        $this->assertNotContains($other->id, $ids);
        $this->assertCount(3, $ids);
        $this->assertSame(['id', 'full_name', 'email', 'level'], array_keys($res->json('data.0')));
    }

    public function test_officers_endpoint_rejects_depot_outside_user_scope(): void
    {
        Sanctum::actingAs($this->supervisor);

        $this->getJson('/api/v1/opname-sessions/officers?kode_depo=LNY')->assertForbidden();
    }

    public function test_officers_endpoint_requires_opname_session_create_permission(): void
    {
        $viewer = User::create([
            'email' => 'opname-viewer@test.com',
            'password' => 'password',
            'full_name' => 'Hanya Lihat',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);

        Sanctum::actingAs($viewer);

        $this->getJson('/api/v1/opname-sessions/officers?kode_depo=DPO')->assertForbidden();
    }

    public function test_counting_records_physical_results_without_touching_wave(): void
    {
        $session = $this->makeSession();
        $this->assertSame('OPEN', $session->status);
        $this->assertCount(2, $session->items);

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();
        $this->assertSame('IN_PROGRESS', $session->fresh()->status);

        $item = $session->items()->first();
        $this->assertNotNull($item->wave_id);

        // Base praktik: penghitungan hanya menyimpan hasil hitung + disposisi;
        // wave BELUM berubah selama sesi belum disetujui.
        $waveBefore = OpnameExpiredWave::find($item->wave_id);
        $res = $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 8,
            'qty_fisik_pcs' => 8,
            'identified_via' => 'scan',
            'condition' => 'FISIK_BAGUS',
            'disposition' => 'RETUR',
        ])->assertOk();

        $this->assertSame(1, $res->json('data.batches_issued'));

        $item = $item->fresh();
        // Koreksi & validasi SAMA SEKALI tidak ditulis di tahap penghitungan.
        $wave = OpnameExpiredWave::find($item->wave_id);
        $this->assertEquals(0, (float) $wave->qty_koreksi_crt);
        $this->assertNull($wave->validated_by);
        $this->assertSame('RETUR', $item->disposition);
        $this->assertNotNull($item->verified_at);
        $this->assertSame($this->field->id, (int) $item->verified_by);

        $batch = Batch::where('receiving_item_id', ReceivingItem::where('kode_barang', 'B-SES-01')->first()->id)->first();
        $this->assertNotNull($batch);
        $this->assertSame('ACTIVE', $batch->status);
    }

    public function test_full_flow_count_submit_approve_applies_wave_corrections(): void
    {
        $session = $this->makeSession();

        // Sesi belum bisa dikirim: 2 baris belum dihitung.
        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();
        $this->postJson("/api/v1/opname-sessions/{$session->id}/submit")->assertStatus(422);

        $item = $session->items()->first();
        $item2 = $session->items()->whereKeyNot($item->id)->first();
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 8,
            'qty_fisik_pcs' => 8,
            'identified_via' => 'scan',
            'condition' => 'FISIK_BAGUS',
            'disposition' => 'LANJUT',
        ])->assertOk();
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item2->id}", [
            'qty_fisik_crt' => 5,
            'identified_via' => 'scan',
            'condition' => 'FISIK_BAGUS',
            'disposition' => 'LANJUT',
        ])->assertOk();

        $this->postJson("/api/v1/opname-sessions/{$session->id}/submit")->assertOk();
        $this->assertSame('PENDING_APPROVAL', $session->fresh()->status);

        // Selama menunggu persetujuan wave masih terkunci.
        Sanctum::actingAs($this->supervisor);
        $waveIds = $session->items->pluck('wave_id')->all();
        $this->postJson('/api/v1/opname-sessions', [
            'week_start' => '2026-09-07',
            'kode_depo' => 'DPO',
            'assigned_to' => $this->field->id,
            'wave_ids' => $waveIds,
        ])->assertStatus(422);

        // Proposisi: selisih fisik = (8-10) + (5-5) = -2.
        Sanctum::actingAs($this->approver);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/approve")->assertOk();

        $session->fresh();
        $wave = OpnameExpiredWave::find($item->wave_id);
        $this->assertEquals(-2, (float) $wave->qty_koreksi_crt);
        // Audit: penghitung = petugas, penyetuju = approver.
        $this->assertSame($this->field->id, (int) $wave->koreksi_by);
        $this->assertSame($this->approver->id, (int) $wave->validated_by);
        $this->assertNotNull($wave->validated_at);
        $this->assertSame('APPROVED', $session->fresh()->status);

        // Sesi keputusan final: penghitungan & kirim ulang ditolak.
        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 1,
            'identified_via' => 'scan',
            'disposition' => 'LANJUT',
        ])->assertStatus(422);

        $history = ApprovalHistory::where('subject_type', OpnameExpiredSession::class)->where('subject_id', $session->id)
            ->orderBy('id')->pluck('action')->all();
        $this->assertSame(['submit', 'approve'], $history);
    }

    public function test_counter_cannot_approve_own_counting(): void
    {
        $session = $this->countedAndSubmittedSession();

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/approve")->assertForbidden();
        $this->assertSame('PENDING_APPROVAL', $session->fresh()->status);
        $this->assertNull($session->items->first()->wave->fresh()->validated_by);
    }

    public function test_approve_only_from_pending_status(): void
    {
        $session = $this->makeSession();

        // Sesi baru (OPEN): tidak bisa langsung disetujui.
        Sanctum::actingAs($this->approver);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/approve")->assertStatus(422);
        $this->assertSame('OPEN', $session->fresh()->status);
    }

    public function test_reject_returns_session_to_officer_then_resubmit_and_approve(): void
    {
        $session = $this->makeSession();

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();
        foreach ($session->items as $si) {
            $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$si->id}", [
                'qty_fisik_crt' => 5,
                'identified_via' => 'scan',
                'condition' => 'FISIK_BAGUS',
                'disposition' => 'LANJUT',
            ])->assertOk();
        }
        $this->postJson("/api/v1/opname-sessions/{$session->id}/submit")->assertOk();

        // Approver menolak: alasan wajib.
        Sanctum::actingAs($this->approver);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/revise")->assertStatus(422);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/revise", [
            'reason' => 'Hitungan PCS tidak cocok dengan foto',
        ])->assertOk();
        $this->assertSame('REVISI', $session->fresh()->status);
        $this->assertSame('Hitungan PCS tidak cocok dengan foto', $session->fresh()->decision_note);

        // Selama revisi wave tetap terkunci dan belum tervalidasi.
        $this->assertNull($session->items->first()->wave->fresh()->validated_by);

        // Petugas memperbaiki: item pertama yang dihitung ulang mengembalikan
        // sesi ke IN_PROGRESS, kemudian kirim ulang dan disetujui.
        Sanctum::actingAs($this->field);
        $item = $session->items()->first();
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 5,
            'qty_fisik_pcs' => 5,
            'identified_via' => 'scan',
            'condition' => 'FISIK_BAGUS',
            'disposition' => 'RETUR',
        ])->assertOk();
        $this->assertSame('IN_PROGRESS', $session->fresh()->status);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/submit")->assertOk();

        Sanctum::actingAs($this->approver);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/approve")->assertOk();
        $this->assertSame('APPROVED', $session->fresh()->status);

        $actions = ApprovalHistory::where('subject_type', OpnameExpiredSession::class)->where('subject_id', $session->id)
            ->orderBy('id')->pluck('action')->all();
        $this->assertSame(['submit', 'revise', 'submit', 'approve'], $actions);
    }

    public function test_verify_does_not_reissue_batch_for_labelled_row(): void
    {
        $session = $this->makeSession();

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();

        $item = $session->items()->first();
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 10,
            'identified_via' => 'scan',
            'condition' => 'FISIK_BAGUS',
            'disposition' => 'LANJUT',
        ])->assertOk();

        // Verifikasi ulang baris yang sama: tidak ada label ganda dan koreksi
        // tetap dihitung sekali di approval (dari hasil hitung TERAKHIR).
        $res = $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 7,
            'identified_via' => 'scan',
            'condition' => 'FISIK_BAGUS',
            'disposition' => 'LANJUT',
        ])->assertOk();

        $this->assertSame(0, $res->json('data.batches_issued'));
        $this->assertSame(1, Batch::whereNotNull('receiving_item_id')->count());
        $this->assertEquals(0, (float) OpnameExpiredWave::find($item->wave_id)->qty_koreksi_crt);
    }

    public function test_cancel_session_writes_nothing(): void
    {
        $session = $this->makeSession();

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/cancel", ['notes' => 'Hujan'])->assertOk();

        $this->assertSame('CANCELLED', $session->fresh()->status);
        $this->assertSame(0, Batch::whereNotNull('receiving_item_id')->count());
        $this->assertSame('0.00', (string) $session->items->first()->wave->fresh()->qty_koreksi_crt);
    }

    public function test_session_expands_one_wave_into_per_batch_items(): void
    {
        // Dua baris ledger satu kunci (barang+depo+expired) = satu wave,
        // dua batch = dua verifikasi; koreksi wave menjumlahkan selisihnya.
        $r1 = $this->receipt('B-SES-M', 10, '2027-02-01');
        $r2 = $this->receipt('B-SES-M', 6, '2027-02-01');
        Batch::issueForReceivingItem($r1);
        Batch::issueForReceivingItem($r2);
        app(OpnameExpiredService::class)->generate();

        $wave = OpnameExpiredWave::where('kode_barang', 'B-SES-M')->first();
        $this->assertSame(['B-SES-M'], [$wave->kode_barang]);
        $this->assertCount(2, $wave->batch_numbers ?? []);

        Sanctum::actingAs($this->supervisor);
        $res = $this->postJson('/api/v1/opname-sessions', [
            'week_start' => '2026-09-07',
            'kode_depo' => 'DPO',
            'assigned_to' => $this->field->id,
            'wave_ids' => [$wave->id],
        ])->assertCreated();

        $session = OpnameExpiredSession::find($res->json('data.id'));
        $this->assertCount(2, $session->items);
        $this->assertSame(2, $session->items->map->batch_id->unique()->count());

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();

        foreach ($session->items as $i => $si) {
            $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$si->id}", [
                'qty_fisik_crt' => 10 - $i,
                'identified_via' => 'scan',
                'condition' => 'FISIK_BAGUS',
                'disposition' => 'LANJUT',
            ])->assertOk();
        }
        $this->postJson("/api/v1/opname-sessions/{$session->id}/submit")->assertOk();

        Sanctum::actingAs($this->approver);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/approve")->assertOk();

        // Selisih: (10-10) + (9-6) = +3.
        $this->assertEquals(3, (float) $wave->fresh()->qty_koreksi_crt);
    }

    public function test_submit_session_sends_pending_approval_email_and_approve_sends_approved(): void
    {
        Mail::fake();

        // Penerima email wajib ada SEBELUM sesi dikirim, karena resolusi
        // penerima (EmailRecipient) dibaca pada momen submit, bukan approve.
        EmailRecipient::create([
            'document_type' => 'opname_expired',
            'trigger' => 'submitted',
            'recipient_type' => 'email',
            'field' => 'TO',
            'email' => 'pengiriman@example.com',
            'is_active' => true,
        ]);
        EmailRecipient::create([
            'document_type' => 'opname_expired',
            'trigger' => 'approved',
            'recipient_type' => 'email',
            'field' => 'TO',
            'email' => 'disetujui@example.com',
            'is_active' => true,
        ]);

        $session = $this->countedAndSubmittedSession();

        Sanctum::actingAs($this->approver);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/approve")->assertOk();

        Mail::assertSent(OpnameExpiredNotification::class, function ($mail) {
            return $mail->hasTo('pengiriman@example.com') && $mail->kind === 'submitted';
        });
        Mail::assertSent(OpnameExpiredNotification::class, function ($mail) {
            return $mail->hasTo('disetujui@example.com') && $mail->kind === 'approved';
        });
    }

    public function test_wave_locked_while_in_open_session(): void
    {
        $session = $this->makeSession();
        $waveIds = $session->items->pluck('wave_id')->all();

        Sanctum::actingAs($this->supervisor);
        $this->postJson('/api/v1/opname-sessions', [
            'week_start' => '2026-09-07',
            'kode_depo' => 'DPO',
            'assigned_to' => $this->field->id,
            'wave_ids' => $waveIds,
        ])->assertStatus(422);

        // Setelah sesi pertama disetujui, wave bebas ditugaskan lagi.
        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();
        foreach ($session->items as $si) {
            $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$si->id}", [
                'qty_fisik_crt' => 5,
                'identified_via' => 'scan',
                'disposition' => 'LANJUT',
            ])->assertOk();
        }
        $this->postJson("/api/v1/opname-sessions/{$session->id}/submit")->assertOk();
        Sanctum::actingAs($this->approver);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/approve")->assertOk();

        Sanctum::actingAs($this->supervisor);
        $this->postJson('/api/v1/opname-sessions', [
            'week_start' => '2026-09-07',
            'kode_depo' => 'DPO',
            'assigned_to' => $this->field->id,
            'wave_ids' => $waveIds,
        ])->assertCreated();
    }

    public function test_verify_requires_identification_method(): void
    {
        $session = $this->makeSession();

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();

        // Tanpa identified_via = input qty tanpa scan/cari dulu → ditolak.
        $item = $session->items()->first();
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 5,
        ])->assertStatus(422);
        $this->assertNull($item->fresh()->verified_at);
    }

    public function test_verify_requires_disposition(): void
    {
        $session = $this->makeSession();

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();

        // Hasil hitung tanpa disposisi ditolak: opname expired tanpa tindak
        // lanjut tidak menutup siklus.
        $item = $session->items()->first();
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 5,
            'identified_via' => 'scan',
        ])->assertStatus(422);
        $this->assertNull($item->fresh()->verified_at);

        // Disposisi di luar daftar juga ditolak.
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 5,
            'identified_via' => 'scan',
            'disposition' => 'DIBAKAR',
        ])->assertStatus(422);
    }

    public function test_tandai_habis_fisik_nol_tanpa_disposisi_dan_koreksi_berlaku_saat_approve(): void
    {
        $session = $this->makeSession();

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();

        $item = $session->items()->first();
        // Tandai habis: exp produk kosong di lapangan — tanpa disposisi.
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 0,
            'identified_via' => 'manual',
            'notes' => 'Batch tidak ada secara fisik',
        ])->assertOk();

        $item = $item->fresh();
        $this->assertNotNull($item->verified_at);
        $this->assertEquals(0, (float) $item->qty_fisik_crt);
        $this->assertNull($item->disposition);
        $this->assertSame($this->field->id, (int) $item->verified_by);

        // Baris kedua dulu agar sesi bisa dikirim.
        $item2 = $session->items()->whereKeyNot($item->id)->first();
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item2->id}", [
            'qty_fisik_crt' => 5,
            'identified_via' => 'scan',
            'disposition' => 'LANJUT',
        ])->assertOk();

        $this->postJson("/api/v1/opname-sessions/{$session->id}/submit")->assertOk();

        // Habis dengan disposisi justru ditolak: tidak ada barang untuk ditindak.
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 0,
            'identified_via' => 'manual',
            'disposition' => 'DISPOSAL',
        ])->assertStatus(422);

        // Proposisi: selisih = (0 − 10 habis) + (5 − 5) = −10 dijumlah
        // seluruh batch satu wave.
        Sanctum::actingAs($this->approver);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/approve")->assertOk();

        $wave = OpnameExpiredWave::find($item->wave_id);
        $this->assertEquals(-10, (float) $wave->qty_koreksi_crt);
    }

    public function test_verify_requires_session_started_first(): void
    {
        $session = $this->makeSession();
        $this->assertSame('OPEN', $session->status);

        // Alur baku: "Mulai Sesi" wajib dulu — input lapangan saat OPEN
        // ditolak, supaya langkah OPEN → IN_PROGRESS tidak bisa dilewati.
        Sanctum::actingAs($this->field);
        $item = $session->items()->first();
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 5,
            'identified_via' => 'scan',
            'disposition' => 'LANJUT',
        ])->assertStatus(422);

        $this->assertNull($item->fresh()->verified_at);
        $this->assertSame('OPEN', $session->fresh()->status);

        // Setelah mulai → hitung boleh.
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 5,
            'identified_via' => 'scan',
            'disposition' => 'LANJUT',
        ])->assertOk();
        $this->assertNotNull($item->fresh()->verified_at);
    }

    public function test_only_assigned_officer_counts_and_submits(): void
    {
        $session = $this->makeSession();

        // Supervisor (memiliki semua permission) bukan petugas yang
        // ditugaskan — penghitungan & pengiriman sesi ditolak.
        Sanctum::actingAs($this->supervisor);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertForbidden();
        $this->assertSame('OPEN', $session->fresh()->status);

        $item = $session->items()->first();
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 5,
            'identified_via' => 'scan',
            'disposition' => 'LANJUT',
        ])->assertForbidden();

        // Petugas yang ditugaskan tetap bisa.
        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();
    }

    public function test_show_includes_per_batch_expected_qty(): void
    {
        $r1 = $this->receipt('B-EXP-01', 10, '2027-02-01');
        $r2 = $this->receipt('B-EXP-02', 5, '2027-02-01');
        $b1 = Batch::issueForReceivingItem($r1);
        Batch::issueForReceivingItem($r2);
        app(OpnameExpiredService::class)->generate();

        Sanctum::actingAs($this->supervisor);
        $waveIds = OpnameExpiredWave::where('week_start', '2026-09-07')->pluck('id')->all();
        $sessionId = $this->postJson('/api/v1/opname-sessions', [
            'week_start' => '2026-09-07',
            'kode_depo' => 'DPO',
            'assigned_to' => $this->field->id,
            'wave_ids' => $waveIds,
        ])->assertCreated()->json('data.id');

        Sanctum::actingAs($this->field);
        $res = $this->getJson("/api/v1/opname-sessions/{$sessionId}")->assertOk();

        $items = collect($res->json('data.items'));
        $this->assertSame([5.0, 10.0], $items->pluck('expected_crt')->map(fn ($v) => (float) $v)->sort()->values()->all());
        $this->assertSame($b1->batch_number, $items->firstWhere('expected_crt', 10.0)['batch']['batch_number']);

        // Konteks penerimaan per baris: petugas (yang juga penerima barang)
        // menganalisa apakah selisih sudah terjadi sejak terima.
        $first = $items->first();
        $this->assertSame('2026-09-09', $first['tanggal_penerimaan']);
        $this->assertSame('FISIK_BAGUS', $first['condition_terima']);
        $this->assertSame(0.0, (float) $first['selisih_terima']);
    }

    public function test_verify_problem_condition_requires_photo(): void
    {
        Storage::fake('public');
        $session = $this->makeSession();

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();

        $item = $session->items()->first();

        // QTY_KURANG tanpa foto → ditolak (sejajar validasi penerimaan).
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 5,
            'condition' => 'QTY_KURANG',
            'identified_via' => 'scan',
            'disposition' => 'LANJUT',
        ])->assertStatus(422);

        // Dengan foto → lolos.
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 5,
            'condition' => 'QTY_KURANG',
            'identified_via' => 'scan',
            'disposition' => 'LANJUT',
            'photo' => UploadedFile::fake()->image('rusak.jpg'),
        ])->assertOk();
        $this->assertNotNull($item->fresh()->photo);
    }

    public function test_add_waves_to_open_session(): void
    {
        $session = $this->makeSession();
        $this->assertCount(2, $session->items);

        // Wave baru muncul belakangan (generate susulan).
        $this->receipt('B-SES-ADD', 7, '2027-04-01');
        app(OpnameExpiredService::class)->generate();
        $newWave = OpnameExpiredWave::where('kode_barang', 'B-SES-ADD')->first();
        $this->assertNotNull($newWave);

        Sanctum::actingAs($this->supervisor);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/waves", [
            'wave_ids' => [$newWave->id],
        ])->assertOk();

        $this->assertCount(3, $session->fresh()->items);

        // Wave milik sesi ini tak bisa ditambah dua kali.
        $this->postJson("/api/v1/opname-sessions/{$session->id}/waves", [
            'wave_ids' => [$newWave->id],
        ])->assertStatus(422);
    }

    public function test_creator_can_reassign_officer_of_open_session(): void
    {
        $session = $this->makeSession();

        Sanctum::actingAs($this->supervisor);
        $this->putJson("/api/v1/opname-sessions/{$session->id}/assign", [
            'assigned_to' => $this->approver->id,
        ])->assertOk();
        $this->assertSame($this->approver->id, $session->fresh()->assigned_to);

        // Petugas baru memang mampu mengerjakan; petugas lama sudah tidak.
        Sanctum::actingAs($this->approver);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();
    }

    public function test_reassign_rejects_officer_of_other_depot(): void
    {
        $session = $this->makeSession();
        $other = User::create([
            'email' => 'opname-other-depo@test.com',
            'password' => 'password',
            'full_name' => 'Petugas Depo Lain',
            'kode_depo' => 'LNY',
            'nama_depo' => 'Depo Lain',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);

        Sanctum::actingAs($this->supervisor);
        $this->putJson("/api/v1/opname-sessions/{$session->id}/assign", [
            'assigned_to' => $other->id,
        ])->assertStatus(422);
    }
}
