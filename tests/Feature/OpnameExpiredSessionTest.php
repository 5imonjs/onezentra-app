<?php

namespace Tests\Feature;

use App\Mail\OpnameExpiredNotification;
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
 * Sesi opname lapangan (aturan A2): supervisor menugaskan wave ke petugas,
 * petugas verifikasi fisik per baris, verifikasi menerbitkan Batch untuk
 * baris ledger yang belum berlabel + menulis koreksi ke wave.
 */
class OpnameExpiredSessionTest extends TestCase
{
    use RefreshDatabase;

    private User $supervisor;

    private User $field;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo('2026-09-09 10:00:00');

        $role = Role::firstOrCreate(['slug' => 'opname_session_test'], ['name' => 'Opname Session Test']);
        foreach (['opname.view', 'opname.create', 'opname.edit'] as $slug) {
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
        $role->users()->attach([$this->supervisor->id, $this->field->id]);
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

        return OpnameExpiredSession::find($res->json('data.id'));
    }

    public function test_full_session_lifecycle_issues_batches_and_writes_wave(): void
    {
        $session = $this->makeSession();
        $this->assertSame('OPEN', $session->status);
        $this->assertCount(2, $session->items);

        // Petugas memulai sesi.
        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();
        $this->assertSame('IN_PROGRESS', $session->fresh()->status);

        // Verifikasi baris pertama: fisik 8 dari 10 tercatat.
        $item = $session->items()->first();
        $res = $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 8,
            'identified_via' => 'scan',
            'qty_fisik_pcs' => 8,
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();

        $this->assertSame(1, $res->json('data.batches_issued'));

        $wave = $item->fresh()->wave;
        $this->assertEquals(-2, (float) $wave->qty_koreksi_crt);
        $this->assertSame($this->field->id, (int) $wave->validated_by);
        $this->assertNotNull($wave->validated_at);

        $batch = Batch::where('receiving_item_id', ReceivingItem::where('kode_barang', 'B-SES-01')->first()->id)->first();
        $this->assertNotNull($batch);
        $this->assertSame('ACTIVE', $batch->status);

        // Sesi belum bisa selesai: 1 baris belum diverifikasi.
        $this->postJson("/api/v1/opname-sessions/{$session->id}/complete")->assertStatus(422);

        // Verifikasi baris kedua lalu selesaikan.
        $item2 = $session->items()->whereNull('verified_at')->first();
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item2->id}", [
            'qty_fisik_crt' => 5,
            'identified_via' => 'scan',
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();

        $this->postJson("/api/v1/opname-sessions/{$session->id}/complete")->assertOk();
        $this->assertSame('COMPLETED', $session->fresh()->status);

        // Sesi selesai tidak bisa diverifikasi lagi.
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 1,
            'identified_via' => 'scan',
        ])->assertStatus(422);
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
        ])->assertOk();

        // Verifikasi ulang baris yang sama: tidak ada label ganda.
        $res = $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 10,
            'identified_via' => 'scan',
            'condition' => 'FISIK_BAGUS',
        ])->assertOk();

        $this->assertSame(0, $res->json('data.batches_issued'));
        $this->assertSame(1, Batch::whereNotNull('receiving_item_id')->count());
    }

    public function test_cancel_session_writes_nothing(): void
    {
        $session = $this->makeSession();

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/cancel", ['notes' => 'Hujan'])->assertOk();

        $this->assertSame('CANCELLED', $session->fresh()->status);
        $this->assertSame(0, Batch::whereNotNull('receiving_item_id')->count());
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
            ])->assertOk();
        }

        // Selisih: (10-10) + (9-6) = +3.
        $this->assertEquals(3, (float) $wave->fresh()->qty_koreksi_crt);
    }

    public function test_complete_session_sends_completed_email(): void
    {
        Mail::fake();
        $session = $this->makeSession();

        EmailRecipient::create([
            'document_type' => 'opname_expired',
            'trigger' => 'completed',
            'recipient_type' => 'email',
            'field' => 'TO',
            'email' => 'selesai@example.com',
            'is_active' => true,
        ]);

        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();
        foreach ($session->items as $si) {
            $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$si->id}", [
                'qty_fisik_crt' => 5,
                'identified_via' => 'scan',
                'condition' => 'FISIK_BAGUS',
            ])->assertOk();
        }
        $this->postJson("/api/v1/opname-sessions/{$session->id}/complete")->assertOk();

        Mail::assertSent(OpnameExpiredNotification::class, function ($mail) {
            return $mail->hasTo('selesai@example.com') && $mail->kind === 'completed';
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

        // Setelah sesi pertama selesai, wave bebas ditugaskan lagi.
        Sanctum::actingAs($this->field);
        $this->postJson("/api/v1/opname-sessions/{$session->id}/start")->assertOk();
        foreach ($session->items as $si) {
            $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$si->id}", [
                'qty_fisik_crt' => 5,
                'identified_via' => 'scan',
            ])->assertOk();
        }
        $this->postJson("/api/v1/opname-sessions/{$session->id}/complete")->assertOk();

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
        $this->assertSame($b1->batch_number, $items->firstWhere('expected_crt', 10)['batch']['batch_number']);
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
        ])->assertStatus(422);

        // Dengan foto → lolos.
        $this->postJson("/api/v1/opname-sessions/{$session->id}/items/{$item->id}", [
            'qty_fisik_crt' => 5,
            'condition' => 'QTY_KURANG',
            'identified_via' => 'scan',
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
}
