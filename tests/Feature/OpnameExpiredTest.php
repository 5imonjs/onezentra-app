<?php

namespace Tests\Feature;

use App\Imports\ReceivingItemImport;
use App\Mail\OpnameExpiredNotification;
use App\Models\Batch;
use App\Models\ClusterPrincipal;
use App\Models\EmailRecipient;
use App\Models\Npn;
use App\Models\OpnameExpiredWave;
use App\Models\Permission;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\Role;
use App\Models\User;
use App\Services\OpnameExpiredService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OpnameExpiredTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo('2026-09-09 10:00:00');

        $role = Role::firstOrCreate(['slug' => 'opname_test'], ['name' => 'Opname Test']);
        foreach (['penerimaan.view', 'penerimaan.create', 'penerimaan.edit', 'penerimaan.delete', 'opname.view', 'opname.create', 'opname.edit'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->user = User::create([
            'email' => 'opname@test.com',
            'password' => 'password',
            'full_name' => 'Opname User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'operator',
            'status' => 'active',
        ]);
        $role->users()->attach($this->user->id);

        Sanctum::actingAs($this->user);
    }

    private function receipt(string $kode, string $nama, float $qty, string $expired, string $tanggalTerima, ?float $pcs = null, string $source = 'IMPORT_MANUAL'): ReceivingItem
    {
        return ReceivingItem::create([
            'source' => $source,
            'kode_barang' => $kode,
            'nama_barang' => $nama,
            'actual_qty' => $qty,
            'expected_qty' => $qty,
            'qty_pcs' => $pcs ?? $qty,
            'satuan' => 'CRT',
            'expired_date' => $expired,
            'tanggal_penerimaan' => $tanggalTerima,
            'sumber_material' => 'PT Pengirim Test',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'condition' => 'GOOD',
            'scanned_by' => $this->user->id,
        ]);
    }

    public function test_generate_creates_wave_with_remaining_days_and_status(): void
    {
        $this->receipt('B-OP-01', 'Produk Aman', 10, '2027-01-01', '2026-09-09');
        $this->receipt('B-OP-02', 'Produk Kritis', 5, '2026-09-10', '2026-09-09');
        $this->receipt('B-OP-03', 'Produk Expired', 2, '2026-09-01', '2026-09-09');

        $result = app(OpnameExpiredService::class)->generate();

        $this->assertSame('2026-09-07', $result['week_start']);
        $this->assertSame('2026-09-13', $result['week_end']);
        $this->assertSame(3, $result['batches']);

        $this->assertDatabaseHas('opname_expired_waves', [
            'week_start' => '2026-09-07',
            'kode_barang' => 'B-OP-01',
            'sisa_hari' => 114,
            'status_ini' => 'AMAN',
            'qty_ini_crt' => 10,
        ]);

        $this->assertDatabaseHas('opname_expired_waves', [
            'week_start' => '2026-09-07',
            'kode_barang' => 'B-OP-02',
            'sisa_hari' => 1,
            'status_ini' => 'KRITIS',
        ]);

        $this->assertDatabaseHas('opname_expired_waves', [
            'week_start' => '2026-09-07',
            'kode_barang' => 'B-OP-03',
            'sisa_hari' => -8,
            'status_ini' => 'EXPIRED',
        ]);
    }

    public function test_generate_rolls_forward_quantity_to_next_week(): void
    {
        $this->receipt('B-OP-01', 'Produk Rolldir', 10, '2027-01-01', '2026-09-09');

        app(OpnameExpiredService::class)->generate();

        $this->travelTo('2026-09-16 10:00:00');
        $this->receipt('B-OP-01', 'Produk Rolldir', 5, '2027-01-01', '2026-09-14');

        $result = app(OpnameExpiredService::class)->generate();

        $this->assertSame('2026-09-14', $result['week_start']);

        $wave = OpnameExpiredWave::where('week_start', '2026-09-14')
            ->where('kode_barang', 'B-OP-01')
            ->first();

        $this->assertNotNull($wave);
        $this->assertEquals(10, $wave->qty_lalu_crt);
        $this->assertEquals(15, $wave->qty_ini_crt);
        $this->assertSame('NAIK +5', $wave->perubahan);
    }

    public function test_generate_carries_batch_forward_when_no_new_receiving(): void
    {
        $this->receipt('B-OP-01', 'Produk Lanjut', 10, '2026-10-01', '2026-09-09');
        app(OpnameExpiredService::class)->generate();

        $this->travelTo('2026-09-16 10:00:00');
        $result = app(OpnameExpiredService::class)->generate();

        $wave = OpnameExpiredWave::where('week_start', '2026-09-14')
            ->where('kode_barang', 'B-OP-01')
            ->first();

        $this->assertNotNull($wave);
        $this->assertEquals(10, $wave->qty_lalu_crt);
        $this->assertEquals(10, $wave->qty_ini_crt);
        $this->assertNotNull($result);
    }

    public function test_generate_rolls_forward_expired_batch_until_acted_upon(): void
    {
        // Aturan baku: batch EXPIRED tidak boleh hilang dari monitoring —
        // terbawa ke minggu depan dengan qty + statusnya sampai ditindak.
        $this->receipt('B-OP-01', 'Produk Kadaluarsa', 10, '2026-09-01', '2026-09-09');
        app(OpnameExpiredService::class)->generate();

        $this->travelTo('2026-09-16 10:00:00');
        app(OpnameExpiredService::class)->generate();

        $this->assertDatabaseHas('opname_expired_waves', [
            'week_start' => '2026-09-07',
            'kode_barang' => 'B-OP-01',
            'status_ini' => 'EXPIRED',
        ]);

        $this->assertDatabaseHas('opname_expired_waves', [
            'week_start' => '2026-09-14',
            'kode_barang' => 'B-OP-01',
            'status_ini' => 'EXPIRED',
            'qty_ini_crt' => 10,
            'qty_lalu_crt' => 10,
        ]);
    }

    public function test_manual_receipt_import_via_api_sets_import_source(): void
    {
        Npn::create([
            'BOSnetszProductId' => 'B-IMP-01',
            'SAPszProductId' => 'SAP-IMP-01',
            'szNickName' => 'Produk Import',
            'decUomConversion1' => 12,
            'szStatus' => 'EXISTING',
        ]);

        $this->postJson('/api/v1/receiving-items', [
            'kode_barang' => 'B-IMP-01',
            'qty_crt' => 3,
            'qty_pcs' => 36,
            'expired_date' => '2027-01-01',
            'tanggal_penerimaan' => '2026-09-09',
            'sumber_material' => 'PT Pengirim',
        ])->assertCreated();

        $this->assertDatabaseHas('receiving_items', [
            'kode_barang' => 'B-IMP-01',
            'source' => 'IMPORT_MANUAL',
            'kode_depo' => 'DPO',
            'actual_qty' => 3,
            'qty_pcs' => 36,
            'sumber_material' => 'PT Pengirim',
        ]);
    }

    public function test_manual_receipt_rejects_zero_qty(): void
    {
        $this->postJson('/api/v1/receiving-items', [
            'kode_barang' => 'B-ZERO',
            'qty_crt' => 0,
            'expired_date' => '2027-01-01',
        ])->assertStatus(422);

        $this->assertDatabaseMissing('receiving_items', ['kode_barang' => 'B-ZERO']);
    }

    public function test_manual_receipt_derives_pcs_from_npn_conversion(): void
    {
        Npn::create([
            'BOSnetszProductId' => 'B-DERIVE',
            'szNickName' => 'Produk Derivasi',
            'decUomConversion1' => 12,
            'szStatus' => 'EXISTING',
        ]);

        $this->postJson('/api/v1/receiving-items', [
            'kode_barang' => 'B-DERIVE',
            'qty_crt' => 3,
            'expired_date' => '2027-01-01',
        ])->assertCreated();

        $this->assertDatabaseHas('receiving_items', [
            'kode_barang' => 'B-DERIVE',
            'qty_pcs' => 36,
        ]);
    }

    public function test_wave_update_records_validation_and_koreksi(): void
    {
        $this->receipt('B-OP-01', 'Produk Validasi', 10, '2027-01-01', '2026-09-09');
        app(OpnameExpiredService::class)->generate();

        $wave = OpnameExpiredWave::where('kode_barang', 'B-OP-01')->first();

        $this->putJson("/api/v1/opname-expired/{$wave->id}", [
            'qty_koreksi_crt' => -2,
        ])->assertOk();

        $wave->refresh();
        $this->assertEquals(-2, $wave->qty_koreksi_crt);
        $this->assertEquals(8, $wave->effectiveCrt());
        $this->assertNotNull($wave->koreksi_at);
        $this->assertSame($this->user->id, $wave->koreksi_by);
    }

    public function test_wave_koreksi_is_used_as_next_week_baseline(): void
    {
        $this->receipt('B-OP-01', 'Produk Koreksi', 10, '2026-12-01', '2026-09-09');
        app(OpnameExpiredService::class)->generate();

        $wave = OpnameExpiredWave::where('kode_barang', 'B-OP-01')->first();
        $wave->update([
            'qty_koreksi_crt' => -4,
            'koreksi_by' => $this->user->id,
            'koreksi_at' => now(),
        ]);

        $this->travelTo('2026-09-16 10:00:00');
        app(OpnameExpiredService::class)->generate();

        $next = OpnameExpiredWave::where('week_start', '2026-09-14')
            ->where('kode_barang', 'B-OP-01')
            ->first();

        $this->assertEquals(6, $next->qty_lalu_crt);
        $this->assertEquals(6, $next->qty_ini_crt);
    }

    public function test_receiving_item_import_from_excel_template(): void
    {
        // Template kolom dipetakan di ReceivingItemImport
        $import = new ReceivingItemImport($this->user);
        $collection = new Collection([[
            'kode_barang' => 'B-XL-01',
            'nama_barang' => 'Produk Excel',
            'qty_crt_zak' => '4',
            'qty_pcs' => '48',
            'tgl_expired_date' => '2027-05-01',
            'tgl_penerimaan' => '2026-09-09',
            'sumber_material' => 'PT Supplier',
        ]]);

        $import->collection($collection);

        $this->assertSame(1, $import->imported);
        // Import mencatat minggu monitoring per baris: 2026-09-09 = minggu Senin 2026-09-07.
        $this->assertSame(['2026-09-07' => 1], $import->weeks);

        // Import ulang file yang sama: tidak menggandakan, dihitung duplikat.
        $retry = new ReceivingItemImport($this->user);
        $retry->collection($collection);

        $this->assertSame(0, $retry->imported);
        $this->assertSame(1, $retry->duplicates);
        $this->assertSame(1, ReceivingItem::where('kode_barang', 'B-XL-01')->count());
        $this->assertDatabaseHas('receiving_items', [
            'kode_barang' => 'B-XL-01',
            'source' => 'IMPORT_MANUAL',
            'kode_depo' => 'DPO',
            'actual_qty' => 4,
            'qty_pcs' => 48,
            'sumber_material' => 'PT Supplier',
        ]);
    }

    public function test_validasi_sj_item_falls_back_to_rencana_kirim_attributes(): void
    {
        $rk = RencanaKirim::create([
            'rkh_date' => '2026-09-01',
            'po_transporter' => 'PO-001',
            'driver_name' => 'Budi',
            'nopol' => 'B 1234 CD',
            'expedisi' => 'Ekspedisi X',
            'shipper_name' => 'PT Kirim Sumber',
            'kode_depo' => 'DEP1',
            'nama_depo' => 'Depo Satu',
            'total_qty' => 4,
            'status' => 'COMPLETED',
            'created_by' => $this->user->id,
            'scheduled_at' => now(),
        ]);

        $receiving = Receiving::create([
            'rencana_kirim_id' => $rk->id,
            'status' => 'COMPLETED',
            'total_expected_qty' => 4,
            'total_received_qty' => 4,
            'checked_by' => $this->user->id,
            'actual_arrival_time' => '2026-09-08 08:00:00',
            'actual_start_time' => '2026-09-08 08:05:00',
        ]);

        $item = ReceivingItem::create([
            'source' => ReceivingItem::SOURCE_VALIDASI,
            'receiving_id' => $receiving->id,
            'kode_barang' => 'B-SJ-01',
            'nama_barang' => 'Barang SJ',
            'actual_qty' => 4,
            'expected_qty' => 4,
            'expired_date' => '2027-01-01',
        ]);

        // Kolom kosong di DB, namun API/UI membaca nilai turunan dari rencana kirim.
        $this->assertSame('PT Kirim Sumber', $item->sumber_material);
        $this->assertSame('DEP1', $item->kode_depo);
        $this->assertSame('Depo Satu', $item->nama_depo);
        $this->assertSame('2026-09-08', $item->tanggal_penerimaan);
        $this->assertNull($item->getRawOriginal('sumber_material'));
    }

    public function test_import_computes_pcs_from_npn_conversion_fallback(): void
    {
        // decUomConversion1 kosong di produksi; konversi ada di BOSnetdecUom.
        Npn::create([
            'BOSnetszProductId' => 'B-FB-01',
            'SAPszProductId' => 'SAP-FB-01',
            'szNickName' => 'Produk Fallback',
            'BOSnetdecUom' => '15',
            'SAPszUomId' => 'CRT',
            'szStatus' => 'EXISTING',
        ]);

        $import = new ReceivingItemImport($this->user);
        $import->collection(new Collection([[
            'kode_barang' => 'B-FB-01',
            'qty_crt_zak' => '2',
            'tgl_expired_date' => '2027-06-01',
            'tgl_penerimaan' => '2026-09-09',
        ]]));

        $item = ReceivingItem::where('kode_barang', 'B-FB-01')->first();

        $this->assertNotNull($item);
        $this->assertEquals(30, $item->qty_pcs);
        $this->assertEquals(15, $item->conversion_factor);
        $this->assertSame('CRT', $item->satuan);
    }

    public function test_import_resolves_both_old_and_new_product_names_to_stable_code(): void
    {
        // Gramatik nama bisa berubah (lama vs baru), tapi BOSnetszProductId
        // tetap — import wajib menangkap keduanya dan menyimpan kode stabil.
        Npn::create([
            'BOSnetszProductId' => 'B-NAME-01',
            'SAPszProductId' => 'SAP-NAME-01',
            'szNickName' => 'NAMA-LAMA',
            'szNickNameNew' => 'NAMA-BARU',
            'szStatus' => 'EXISTING',
        ]);

        $import = new ReceivingItemImport($this->user);
        $import->collection(new Collection([
            [
                'produk' => 'NAMA-LAMA',
                'qty_crt_zak' => '1',
                'tgl_expired_date' => '2027-06-01',
                'tgl_penerimaan' => '2026-09-09',
            ],
            [
                'produk' => 'NAMA-BARU',
                'qty_crt_zak' => '1',
                'tgl_expired_date' => '2027-07-01',
                'tgl_penerimaan' => '2026-09-09',
            ],
        ]));

        $this->assertSame(2, $import->imported);
        $this->assertSame(2, ReceivingItem::where('kode_barang', 'B-NAME-01')->count());
    }

    public function test_import_issues_one_batch_per_row(): void
    {
        // Aturan baku: tiap baris ledger wajib tepat satu batch (IMP-).
        $import = new ReceivingItemImport($this->user);
        $import->collection(new Collection([[
            'kode_barang' => 'B-BT-01',
            'qty_crt_zak' => '3',
            'tgl_expired_date' => '2027-05-01',
            'tgl_penerimaan' => '2026-09-09',
        ]]));

        $item = ReceivingItem::where('kode_barang', 'B-BT-01')->first();
        $this->assertNotNull($item->verifiedBatch);
        $this->assertStringStartsWith('IMP-', $item->verifiedBatch->batch_number);

        // Idempoten: penerbitan ulang mengembalikan batch yang sama.
        $this->assertTrue(Batch::issueForReceivingItem($item)->is($item->verifiedBatch));
        $this->assertSame(1, Batch::where('receiving_item_id', $item->id)->count());
    }

    public function test_every_batch_has_a_unique_barcode(): void
    {
        // Aturan FEFO/traceability: tiap batch wajib ber-barcode unik
        // (dikunci unique constraint di database, bukan hanya di aplikasi).
        $a = $this->receipt('B-BC-01', 'Barcode 1', 2, '2027-02-01', '2026-09-09');
        $b = $this->receipt('B-BC-02', 'Barcode 2', 2, '2027-02-01', '2026-09-09');
        $ba = Batch::issueForReceivingItem($a);
        $bb = Batch::issueForReceivingItem($b);

        $this->assertNotNull($ba->barcode_label);
        $this->assertNotSame($ba->barcode_label, $bb->barcode_label);

        $this->expectException(UniqueConstraintViolationException::class);

        Batch::create([
            'batch_number' => Batch::generateNumber('BATCH-'),
            'barcode_label' => $ba->barcode_label,
            'status' => 'ACTIVE',
        ]);
    }

    public function test_index_returns_status_summary_and_multi_status_filter(): void
    {
        $this->receipt('B-SUM-01', 'Produk Aman', 10, '2027-01-01', '2026-09-09');
        $this->receipt('B-SUM-02', 'Produk Kritis', 10, '2026-09-10', '2026-09-09');
        $this->receipt('B-SUM-03', 'Produk Perhatian', 10, '2026-10-10', '2026-09-09');
        $this->receipt('B-SUM-04', 'Produk Expired', 10, '2026-09-01', '2026-09-09');

        app(OpnameExpiredService::class)->generate();

        $res = $this->getJson('/api/v1/opname-expired')
            ->assertOk()
            ->assertJsonPath('meta.status_summary.AMAN.count', 1)
            ->assertJsonPath('meta.status_summary.PERHATIAN.count', 1)
            ->assertJsonPath('meta.status_summary.KRITIS.count', 1)
            ->assertJsonPath('meta.status_summary.EXPIRED.count', 1)
            ->assertJsonPath('meta.status_summary.AMAN.qty_crt', 10)
            ->assertJsonPath('meta.prev_week_start', '2026-08-31')
            ->assertJsonPath('meta.prev_status_summary.AMAN.count', 0);

        $this->assertSame(4, $res->json('meta.status_summary')['AMAN']['count'] + $res->json('meta.status_summary')['PERHATIAN']['count'] + $res->json('meta.status_summary')['KRITIS']['count'] + $res->json('meta.status_summary')['EXPIRED']['count']);

        $depot = $res->json('meta.depot_summary');
        $this->assertCount(4, $depot);
        $this->assertSame('DPO', $depot[0]['kode_depo']);
        $this->assertSame('AMAN', collect($depot)->sortBy('status')->first()['status']);
        $this->assertEquals(10, collect($depot)->sortBy('status')->first()['qty_crt']);

        $filtered = $this->getJson('/api/v1/opname-expired?statuses=KRITIS,EXPIRED')
            ->assertOk();

        $this->assertSame(2, $filtered->json('data.total'));
        $this->assertSame(['EXPIRED', 'KRITIS'], collect($filtered->json('data.data'))->pluck('status_ini')->unique()->sort()->values()->all());
    }

    public function test_cancelled_batch_is_excluded_from_opname(): void
    {
        // Batch label yang sudah tercetak jadi tidak berlaku begitu sesi
        // validasi dibatalkan (backend cancel() -> batches.status = CANCELLED).
        // Kalau Batch Expired tetap menghitungnya, operator akan melihat
        // stok yang labelnya sudah dibatalkan masih harus dikirim/retur.
        $rencana = RencanaKirim::create([
            'po_transporter' => 'PO-BATCH-TEST',
            'status' => 'DRAFT',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
        ]);

        $receiving = Receiving::create([
            'rencana_kirim_id' => $rencana->id,
            'status' => 'DRAFT',
        ]);

        $item = ReceivingItem::create([
            'receiving_id' => $receiving->id,
            'source' => 'IMPORT_MANUAL',
            'kode_barang' => 'B-CANCEL-01',
            'nama_barang' => 'Produk Dibatalkan',
            'actual_qty' => 10,
            'expected_qty' => 10,
            'qty_pcs' => 10,
            'satuan' => 'CRT',
            'expired_date' => '2027-01-01',
            'tanggal_penerimaan' => '2026-09-09',
            'sumber_material' => 'PT Pengirim Test',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'condition' => 'GOOD',
            'scanned_by' => $this->user->id,
        ]);

        $batch = Batch::create([
            'batch_number' => 'BATCH-TEST01',
            'barcode_label' => 'LBL-TEST01',
            'receiving_id' => $receiving->id,
            'status' => 'ACTIVE',
        ]);

        app(OpnameExpiredService::class)->generate();
        $this->assertDatabaseHas('opname_expired_waves', [
            'kode_barang' => 'B-CANCEL-01',
            'qty_ini_crt' => 10,
        ]);

        // Batalkan sesi -> label jadi tidak berlaku.
        $batch->update(['status' => 'CANCELLED']);
        OpnameExpiredWave::query()->delete();

        app(OpnameExpiredService::class)->generate();

        $this->assertDatabaseMissing('opname_expired_waves', [
            'kode_barang' => 'B-CANCEL-01',
        ]);
    }

    public function test_pending_reports_eligible_split_by_source_before_generate(): void
    {
        // Baseline campuran: 1 baris SJ + 2 baris import pada minggu berjalan.
        // Sebelum generate, semuanya pending dan wave belum ada.
        $this->receipt('B-PEND-SJ', 'Produk SJ', 4, '2027-02-01', '2026-09-09', null, 'VALIDASI_SJ');
        $this->receipt('B-PEND-IM1', 'Produk Import 1', 3, '2027-02-01', '2026-09-09');
        $this->receipt('B-PEND-IM2', 'Produk Import 2', 2, '2027-02-01', '2026-09-09');

        $res = $this->getJson('/api/v1/opname-expired/pending?week_start=2026-09-07')->assertOk();

        $this->assertSame('2026-09-07', $res->json('data.week_start'));
        $this->assertFalse($res->json('data.wave_exists'));
        $this->assertSame(3, $res->json('data.eligible.total'));
        $this->assertSame(1, $res->json('data.eligible.sj'));
        $this->assertSame(2, $res->json('data.eligible.import'));
        $this->assertSame(3, $res->json('data.pending.total'));
        $this->assertSame(1, $res->json('data.pending.sj'));
        $this->assertSame(2, $res->json('data.pending.import'));
    }

    public function test_pending_is_zero_after_generate_and_tracks_new_import(): void
    {
        $this->receipt('B-PEND-G', 'Produk Generate', 5, '2027-02-01', '2026-09-09');

        app(OpnameExpiredService::class)->generate();

        $afterGenerate = $this->getJson('/api/v1/opname-expired/pending?week_start=2026-09-07')->assertOk();
        $this->assertTrue($afterGenerate->json('data.wave_exists'));
        $this->assertSame(0, $afterGenerate->json('data.pending.total'));

        // Import susulan dengan kombinasi barang+expired baru = pending lagi.
        $this->receipt('B-PEND-NEW', 'Produk Susulan', 1, '2027-03-01', '2026-09-10');

        $afterImport = $this->getJson('/api/v1/opname-expired/pending?week_start=2026-09-07')->assertOk();
        $this->assertSame(1, $afterImport->json('data.pending.total'));
        $this->assertSame(1, $afterImport->json('data.pending.import'));
        $this->assertSame(0, $afterImport->json('data.pending.sj'));
    }

    public function test_bulk_destroy_deletes_selected_import_rows_but_never_sj(): void
    {
        $keep = $this->receipt('B-BULK-KEEP', 'Tetap Ada', 3, '2027-02-01', '2026-09-09');
        $drop = $this->receipt('B-BULK-DROP', 'Dihapus', 2, '2027-02-01', '2026-09-09');
        $sj = $this->receipt('B-BULK-SJ', 'Item SJ', 1, '2027-02-01', '2026-09-09', null, 'VALIDASI_SJ');

        // ID SJ ikut dikirim: harus diabaikan, bukan error, bukan terhapus.
        $res = $this->deleteJson('/api/v1/receiving-items/bulk', ['ids' => [$drop->id, $sj->id]])->assertOk();

        $this->assertSame(1, $res->json('deleted'));
        $this->assertDatabaseMissing('receiving_items', ['id' => $drop->id]);
        $this->assertDatabaseHas('receiving_items', ['id' => $keep->id]);
        $this->assertDatabaseHas('receiving_items', ['id' => $sj->id]);
    }

    public function test_bulk_destroy_all_clears_import_scope_only(): void
    {
        $this->receipt('B-BULK-A1', 'Import 1', 1, '2027-02-01', '2026-09-09');
        $this->receipt('B-BULK-A2', 'Import 2', 1, '2027-02-01', '2026-09-09');
        $sj = $this->receipt('B-BULK-A3', 'Item SJ', 1, '2027-02-01', '2026-09-09', null, 'VALIDASI_SJ');

        $res = $this->deleteJson('/api/v1/receiving-items/bulk', ['all' => true])->assertOk();

        $this->assertSame(2, $res->json('deleted'));
        $this->assertSame(0, ReceivingItem::where('source', 'IMPORT_MANUAL')->count());
        $this->assertDatabaseHas('receiving_items', ['id' => $sj->id]);
    }

    public function test_import_rows_anchor_to_import_week_regardless_of_file_date(): void
    {        // Aturan baku: baris IMPORT ditambatkan ke minggu IMPORT (scan/created),
        // bukan tanggal file. Baris bertanggal lama tapi diimport minggu ini
        // tetap eligible minggu ini; baris SJ bertanggal lama tidak.
        $baseline = $this->receipt('B-ANCHOR-IM', 'Baseline Lama', 2, '2027-02-01', '2026-08-06');
        $sj = $this->receipt('B-ANCHOR-SJ', 'SJ Lama', 2, '2027-02-01', '2026-08-06', null, 'VALIDASI_SJ');

        $res = $this->getJson('/api/v1/opname-expired/pending?week_start=2026-09-07')->assertOk();

        $this->assertSame(1, $res->json('data.eligible.import'));
        $this->assertSame(0, $res->json('data.eligible.sj'));
        $this->assertSame(1, $res->json('data.pending.total'));

        app(OpnameExpiredService::class)->generate();

        $this->assertDatabaseHas('opname_expired_waves', [
            'week_start' => '2026-09-07',
            'kode_barang' => 'B-ANCHOR-IM',
        ]);
        $this->assertDatabaseMissing('opname_expired_waves', [
            'week_start' => '2026-09-07',
            'kode_barang' => 'B-ANCHOR-SJ',
        ]);
    }

    public function test_index_returns_principal_2_from_cluster_principal_master(): void
    {
        // Join yang sama dengan laporan: BOSnet stabil dulu.
        $cp = ClusterPrincipal::create(['product_sku' => 'B-PRIN-01', 'principal_1' => 'PRIN-A', 'principal_2' => 'PRIN-B']);
        $cp->update(['bosnetsz_product_id' => 'B-PRIN-01']);
        $this->receipt('B-PRIN-01', 'Produk Principal', 4, '2027-02-01', '2026-09-09');

        app(OpnameExpiredService::class)->generate();

        $res = $this->getJson('/api/v1/opname-expired?week_start=2026-09-07')->assertOk();

        $this->assertSame('PRIN-B', $res->json('data.data.0.principal_2'));
        $this->assertSame('PRIN-A', $res->json('data.data.0.principal_1'));
    }

    public function test_index_falls_back_to_direct_product_sku_join(): void
    {
        // SKU pendek yang belum terdaftar di NPN tetap ketemu master bila
        // product_sku-nya cocok langsung (jaring terakhir COALESCE).
        ClusterPrincipal::create(['product_sku' => 'BBSG20', 'principal_2' => 'PRIN-SKU']);
        $this->receipt('BBSG20', 'Produk SKU Pendek', 4, '2027-02-01', '2026-09-09');

        app(OpnameExpiredService::class)->generate();

        $res = $this->getJson('/api/v1/opname-expired?week_start=2026-09-07')->assertOk();

        $this->assertSame('PRIN-SKU', $res->json('data.data.0.principal_2'));
    }

    public function test_index_joins_cluster_principal_via_new_nickname(): void
    {        // NPN kenal produk lewat nama baru; master CP memakai nama baru itu —
        // join lama-baru wajib menangkapnya walau ID stabil CP belum terisi.
        Npn::create([
            'BOSnetszProductId' => 'B-NICK-01',
            'SAPszProductId' => 'SAP-NICK-01',
            'szNickName' => 'NAMA-LAMA-JOIN',
            'szNickNameNew' => 'NAMA-BARU-JOIN',
            'szStatus' => 'EXISTING',
        ]);
        ClusterPrincipal::create(['product_sku' => 'NAMA-BARU-JOIN', 'principal_2' => 'PRIN-NEW']);
        $this->receipt('B-NICK-01', 'Produk Nama Baru', 4, '2027-02-01', '2026-09-09');

        app(OpnameExpiredService::class)->generate();

        $res = $this->getJson('/api/v1/opname-expired?week_start=2026-09-07')->assertOk();

        $this->assertSame('PRIN-NEW', $res->json('data.data.0.principal_2'));
    }

    public function test_index_sorts_by_allowlisted_columns(): void
    {
        $this->receipt('B-SORT-B', 'Produk B', 2, '2027-02-01', '2026-09-09');
        $this->receipt('B-SORT-A', 'Produk A', 9, '2027-03-01', '2026-09-09');

        app(OpnameExpiredService::class)->generate();

        $asc = $this->getJson('/api/v1/opname-expired?week_start=2026-09-07&sort_by=produk&sort_dir=asc')->assertOk();
        $this->assertSame(['B-SORT-A', 'B-SORT-B'], collect($asc->json('data.data'))->pluck('kode_barang')->all());

        $desc = $this->getJson('/api/v1/opname-expired?week_start=2026-09-07&sort_by=crt&sort_dir=desc')->assertOk();
        $this->assertSame(['B-SORT-A', 'B-SORT-B'], collect($desc->json('data.data'))->pluck('kode_barang')->all());

        // Kolom di luar allowlist diabaikan (tetap 200, urutan bawaan).
        $this->getJson('/api/v1/opname-expired?week_start=2026-09-07&sort_by=kode_depo;DROP&sort_dir=desc')->assertOk();
    }

    public function test_index_does_not_duplicate_wave_on_duplicate_master_rows(): void
    {
        // Data kotor: 1 BOS menunjuk 2 baris master berbeda — wave tetap
        // 1 baris (dedup deterministik), bukan ganda.
        ClusterPrincipal::create(['product_sku' => 'DUP-1', 'principal_1' => 'AAA']);
        ClusterPrincipal::create(['product_sku' => 'DUP-2', 'principal_1' => 'BBB']);
        ClusterPrincipal::whereIn('product_sku', ['DUP-1', 'DUP-2'])
            ->update(['bosnetsz_product_id' => 'B-DUP-01']);
        $this->receipt('B-DUP-01', 'Produk Duplikat', 4, '2027-02-01', '2026-09-09');

        app(OpnameExpiredService::class)->generate();

        $res = $this->getJson('/api/v1/opname-expired?week_start=2026-09-07')->assertOk();

        $this->assertSame(1, $res->json('data.total'));
        $this->assertSame(1, count($res->json('data.data')));
    }

    public function test_progress_reports_submitted_vs_pending_per_depot(): void
    {
        // Lihat dua depo: butuh user global (tanpa depot.view_all, depo
        // LAIN tak terlihat karena scope).
        $globalRole = Role::firstOrCreate(['slug' => 'opname_global'], ['name' => 'Opname Global']);
        foreach (['opname.view', 'depot.view_all'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug]);
            $globalRole->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $global = User::create([
            'email' => 'opname-global@test.com',
            'password' => 'password',
            'full_name' => 'Opname Global',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
        $globalRole->users()->attach($global->id);
        Sanctum::actingAs($global);

        // Dua depo: DPO tervalidasi penuh (terkirim), LAIN belum.
        $this->receipt('B-PRG-01', 'Produk Prog', 4, '2027-02-01', '2026-09-09');
        ReceivingItem::create([
            'source' => 'IMPORT_MANUAL',
            'kode_barang' => 'B-PRG-02',
            'actual_qty' => 2,
            'expected_qty' => 2,
            'expired_date' => '2027-02-01',
            'tanggal_penerimaan' => '2026-09-09',
            'kode_depo' => 'LAIN',
            'nama_depo' => 'Depo Lain',
            'scanned_by' => $this->user->id,
        ]);
        app(OpnameExpiredService::class)->generate();

        OpnameExpiredWave::where('week_start', '2026-09-07')
            ->where('kode_depo', 'DPO')
            ->update(['validated_by' => $this->user->id, 'validated_at' => now()]);

        $res = $this->getJson('/api/v1/opname-expired/progress?week_start=2026-09-07')->assertOk();
        $depots = collect($res->json('data.depots'))->keyBy('kode_depo');

        $this->assertTrue((bool) $depots['DPO']['submitted']);
        $this->assertFalse((bool) $depots['LAIN']['submitted']);
        $this->assertSame(1, $res->json('data.submitted_count'));
        $this->assertSame(1, $res->json('data.pending_count'));
    }

    public function test_remind_sends_email_to_pending_depots_only(): void
    {
        Mail::fake();
        $this->receipt('B-RMD-01', 'Produk Remind', 4, '2027-02-01', '2026-09-09');
        app(OpnameExpiredService::class)->generate();

        EmailRecipient::create([
            'document_type' => 'opname_expired',
            'trigger' => 'reminder',
            'recipient_type' => 'email',
            'field' => 'TO',
            'email' => 'pengingat@example.com',
            'is_active' => true,
        ]);

        $res = $this->postJson('/api/v1/opname-expired/remind', ['week_start' => '2026-09-07'])->assertOk();

        $this->assertSame(['DPO'], $res->json('data.reminded'));
        Mail::assertSent(OpnameExpiredNotification::class, function ($mail) {
            return $mail->hasTo('pengingat@example.com') && $mail->kind === 'reminder';
        });
    }

    public function test_remind_rejected_when_all_submitted(): void
    {
        Mail::fake();
        $this->receipt('B-RMD2-01', 'Produk Remind 2', 4, '2027-02-01', '2026-09-09');
        app(OpnameExpiredService::class)->generate();
        OpnameExpiredWave::where('week_start', '2026-09-07')
            ->update(['validated_by' => $this->user->id, 'validated_at' => now()]);

        $this->postJson('/api/v1/opname-expired/remind', ['week_start' => '2026-09-07'])->assertStatus(422);
        Mail::assertNotSent(OpnameExpiredNotification::class);
    }
}
