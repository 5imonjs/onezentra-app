<?php

namespace Tests\Feature;

use App\Imports\ReceivingItemImport;
use App\Models\ClusterPrincipal;
use App\Models\Npn;
use App\Models\Permission;
use App\Models\ReceivingItem;
use App\Models\Role;
use App\Models\StandarUmurProduk;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use Tests\TestCase;

class PenerimaanExpiredReportTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::firstOrCreate(['slug' => 'expired_report_view'], ['name' => 'Expired Report View']);
        foreach (['reports.view', 'depot.view_all'] as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug, 'name' => $slug], ['menu_group' => 'Reports']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $this->user = User::create([
            'email' => 'expired-report@test.com',
            'password' => 'password',
            'full_name' => 'Expired Report User',
            'kode_depo' => '0000',
            'nama_depo' => 'Kantor Pusat',
            'level' => 'admin_distirbusi',
            'status' => 'active',
        ]);
        $role->users()->attach($this->user->id);
        Sanctum::actingAs($this->user);

        // Tanggal acuan dipatok supaya Past/Future deterministik.
        Carbon::setTestNow('2026-10-05 00:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /**
     * Sambung produk → NPN → master standar umur supaya cluster bisa diuji
     * pada jalur join yang sama dengan produksi.
     */
    private function makeClusterMaster(string $kodeBarang, string $sapId, string $cluster): void
    {
        Npn::create([
            'BOSnetszProductId' => $kodeBarang,
            'SAPszProductId' => $sapId,
            'szNickName' => strtoupper(substr(md5($kodeBarang), 0, 5)),
            'szStatus' => 'EXISTING',
        ]);

        StandarUmurProduk::create([
            'material' => $sapId,
            'material_description' => 'Produk '.$kodeBarang,
            'cluster' => $cluster,
            'umur' => 24,
        ]);
    }

    private function makeItem(
        string $kodeBarang,
        string $expired = '2026-12-01',
        string $tanggal = '2026-09-01',
        ?float $qtyPcs = 240,
    ): ReceivingItem {
        return ReceivingItem::create([
            'source' => 'IMPORT_MANUAL',
            'kode_barang' => $kodeBarang,
            'nama_barang' => 'Produk '.$kodeBarang,
            'actual_qty' => 10,
            'qty_pcs' => $qtyPcs,
            'satuan' => 'CRT',
            'expired_date' => $expired,
            'tanggal_penerimaan' => $tanggal,
            'kode_depo' => '0127',
            'nama_depo' => 'Singkawang',
            'condition' => 'FISIK_BAGUS',
        ]);
    }

    /**
     * Uji end-to-end dengan data export manual user (41 baris, 35 SKU).
     *
     * Tujuannya membuktikan format laporan menghabisi seluruh isi laporan
     * manual user — termasuk SKU yang terulang (ESVAG800, BBCC2, PEDU380,
     * PEVA200, BBSG250, OKJMFL20) dan qty yang dipisah antara DUS dan PCS.
     */
    public function test_exports_the_user_manual_expired_report_shape(): void
    {
        $this->seedMasterFor(self::MANUAL_ROWS);
        $this->seedReceivingFor(self::MANUAL_ROWS);

        $response = $this->get('/api/v1/reports/penerimaan-batch-expired/export');
        $response->assertOk();
        $sheet = $this->sheetFromResponse($response->streamedContent());

        // Satu baris = satu penerimaan produk: 41 baris data export.
        $this->assertCount(41, $sheet->rangeToArray('A2:M42'));

        $exported = [];
        for ($r = 2; $r <= 42; $r++) {
            $exported[] = [
                'produk' => $sheet->getCell("C{$r}")->getValue(),
                'dus' => (int) $sheet->getCell("G{$r}")->getValue(),
                'pcs' => (int) $sheet->getCell("H{$r}")->getValue(),
                // Serial Excel = JUMLAH HARI sejak 1899-12-30, bukan detik —
                // jangan pakai gmdate()/date() langsung (hasilnya 1970).
                'expired' => Date::excelToDateTimeObject((float) $sheet->getCell("I{$r}")->getValue())->format('Y-m-d'),
                'terima' => Date::excelToDateTimeObject((float) $sheet->getCell("J{$r}")->getValue())->format('Y-m-d'),
            ];
        }

        // Fixture user dalam format array assoc agar konsisten dengan hasil baca
        // sel Excel di atas.
        $expected = array_map(fn (array $row) => [
            'produk' => $row[0],
            'dus' => $row[1],
            'pcs' => $row[2],
            'expired' => $row[3],
            'terima' => $row[4],
        ], self::MANUAL_ROWS);

        // Bandingkan sebagai MULTISET (abaikan urutan): laporan mengurutkan
        // per (cluster, produk, tanggal DESC) demi pengelompokan, bukan
        // mengikuti urutan ketik di Excel. Dus/pcs jadi angka di sini supaya
        // '0' teks vs 0 angka tidak dianggap beda.
        $bucket = function (array $row): string {
            $qty = sprintf('%g|%g', $row['dus'], $row['pcs']);

            return $row['produk'].'|'.$qty.'|'.$row['expired'].'|'.$row['terima'];
        };

        $expectedBuckets = [];
        foreach ($expected as $row) {
            $expectedBuckets[$bucket($row)] = ($expectedBuckets[$bucket($row)] ?? 0) + 1;
        }

        $exportedBuckets = [];
        foreach ($exported as $row) {
            $exportedBuckets[$bucket($row)] = ($exportedBuckets[$bucket($row)] ?? 0) + 1;
        }

        ksort($expectedBuckets);
        ksort($exportedBuckets);

        $this->assertSame(
            $expectedBuckets,
            $exportedBuckets,
            'Isi export harus identik dengan 41 baris laporan manual user (tanpa peduli urutan)'
        );

        // Regresi bug tanggal-string: kolom tanggal harus serial angka Excel.
        $this->assertIsNumeric($sheet->getCell('I2')->getValue());
        $this->assertIsNumeric($sheet->getCell('J2')->getValue());

        // WEEKDAY & SISA SIMPAN berformula ke kolom yang benar (I expired, J terima).
        $weekday = (string) $sheet->getCell('K2')->getValue();
        $this->assertStringContainsString('I2', $weekday);
        $this->assertStringContainsString('TODAY()', $weekday);

        $sisaSimpan = (string) $sheet->getCell('L2')->getValue();
        $this->assertStringContainsString('DATEDIF(J2,I2', $sisaSimpan);

        $this->assertSame(
            ['NO', 'GROUPING BY CLUSTER', 'PRODUK', 'NAMA PRODUK', 'PRINCIPAL 1',
                'PRINCIPAL 2', 'DUS/BALL', 'PCS', 'TANGGAL EXPIRED',
                'TANGGAL PENERIMAAN', 'WEEKDAY', 'SISA SIMPAN', 'SISA HARI'],
            $sheet->rangeToArray('A1:M1')[0]
        );
    }

    /**
     * Bangun master NPN + Standar Umur + Cluster Principal untuk daftar SKU
     * fixture sehingga jalur auto-lookup PRODUK → NPN → CLUSTER/PRINCIPAL
     * teruji persis seperti produksi.
     *
     * @param  array<int, array{0:string}>  $rows
     */
    private function seedMasterFor(array $rows): void
    {
        $seen = [];

        foreach ($rows as [$sku]) {
            if (isset($seen[$sku])) {
                continue;
            }
            $seen[$sku] = true;

            $kodeBarang = 'BOS'.$sku;
            $sapId = 'SAP'.$sku;
            $cluster = match (true) {
                str_starts_with($sku, 'OKJM'),
                $sku === 'OKKIOR20' => 'Big Cup',
                str_starts_with($sku, 'OJ') => 'Small Cup',
                str_starts_with($sku, 'BB') => 'FLORA',
                $sku === 'MMTKG3' => 'NPL',
                default => 'ABBOTT',
            };

            Npn::create([
                'BOSnetszProductId' => $kodeBarang,
                'SAPszProductId' => $sapId,
                'szNickName' => $sku,
                'szShortDescription' => $sku.' - Produk '.$sku,
                'szStatus' => 'EXISTING',
            ]);

            StandarUmurProduk::create([
                'material' => $sapId,
                'material_description' => 'Produk '.$sku,
                'cluster' => $cluster,
                'umur' => 24,
            ]);

            ClusterPrincipal::firstOrCreate(
                ['product_sku' => $sku],
                [
                    'principal_1' => $cluster,
                    'principal_2' => $cluster.' Sub',
                ]
            );
        }
    }

    /**
     * Isi ledger penerimaan dari fixture 5 kolom user:
     * [SKU, DUS/BALL, PCS, EXPIRED ISO, TGL TERIMA ISO].
     *
     * @param  array<int, array{0:string,1:int,2:int,3:string,4:string}>  $rows
     */
    private function seedReceivingFor(array $rows): void
    {
        foreach ($rows as [$sku, $dus, $pcs, $expired, $terima]) {
            ReceivingItem::create([
                'source' => 'IMPORT_MANUAL',
                'kode_barang' => 'BOS'.$sku,
                'nama_barang' => 'Produk '.$sku,
                'actual_qty' => $dus,
                'qty_pcs' => $pcs,
                'satuan' => 'CRT',
                'expired_date' => $expired,
                'tanggal_penerimaan' => $terima,
                'kode_depo' => '0127',
                'nama_depo' => 'Singkawang',
                'condition' => 'FISIK_BAGUS',
            ]);
        }
    }

    /**
     * Fixture hasil export manual user (41 baris, 35 SKU unik).
     *
     * Format sumber: [SKU, DUS/BALL, PCS, EXPIRED (dd/mm/yyyy), TGL TERIMA (dd/mm/yyyy)]
     * Tanggal dikonversi ke ISO sekali di sini supaya asersi bisa membaca
     * nilai ISO tanpa parsing ulang — dan membuat kekeliruan dd/mm vs mm/dd
     * terlihat langsung di review kode.
     */
    private const MANUAL_ROWS = [
        ['ESCO380', 0, 13, '2026-12-09', '2025-07-07'],
        ['ESCOP380', 0, 23, '2027-05-07', '2026-05-26'],
        ['ESCOP800', 2, 0, '2027-10-10', '2026-04-20'],
        ['ESVAG150', 0, 8, '2027-07-07', '2026-07-16'],
        ['ESVAG380', 0, 16, '2028-03-01', '2026-08-08'],
        ['ESVAG800', 2, 8, '2027-07-07', '2026-05-26'],
        ['ESVAG800', 5, 0, '2027-10-10', '2026-08-27'],
        ['PECO380', 0, 6, '2027-07-07', '2026-07-16'],
        ['PECO800', 0, 9, '2027-07-07', '2026-04-25'],
        ['PEDU380', 0, 12, '2027-11-20', '2026-05-30'],
        ['PEDU380', 1, 0, '2027-11-11', '2026-08-14'],
        ['PEDU800', 0, 10, '2027-11-11', '2026-06-26'],
        ['PEVA200', 0, 3, '2027-11-27', '2026-04-29'],
        ['PEVA200', 1, 0, '2028-01-01', '2026-08-15'],
        ['PEVA380', 1, 3, '2027-11-11', '2026-08-15'],
        ['PEVA450', 3, 3, '2028-03-03', '2026-08-27'],
        ['PEVA800', 0, 10, '2027-12-12', '2026-07-11'],
        ['TPECO110', 0, 11, '2027-01-04', '2026-01-15'],
        ['TPEVA110', 0, 30, '2026-12-29', '2026-01-15'],
        ['BBCC1', 16, 9, '2027-03-07', '2026-08-06'],
        ['BBCC2', 16, 5, '2027-12-12', '2025-11-19'],
        ['BBCC2', 14, 0, '2028-01-07', '2026-02-06'],
        ['BBCC200', 67, 52, '2027-07-07', '2026-08-06'],
        ['BBMC15', 49, 0, '2026-10-28', '2026-04-25'],
        ['BBMC500', 4, 0, '2027-05-06', '2026-08-06'],
        ['BBSG190', 18, 12, '2027-04-20', '2026-08-13'],
        ['BBSG20', 0, 1, '2026-10-08', '2025-11-19'],
        ['BBSG200', 491, 23, '2027-01-17', '2026-06-02'],
        ['BBSG250', 90, 20, '2027-01-17', '2026-01-23'],
        ['BBSG250', 72, 0, '2027-02-22', '2026-01-23'],
        ['BBSK65', 83, 8, '2027-04-26', '2026-07-22'],
        ['MMTKG3', 15, 0, '2027-04-24', '2026-08-19'],
        ['OKJMBL20', 127, 0, '2027-04-30', '2026-07-11'],
        ['OKJMFL20', 464, 0, '2027-05-21', '2026-07-17'],
        ['OKJMFL20', 1264, 0, '2027-06-23', '2026-08-10'],
        ['OKJMJA20', 1292, 0, '2027-07-26', '2026-07-21'],
        ['OKJMJE20', 757, 0, '2027-06-03', '2026-05-18'],
        ['OKJMST20', 2, 0, '2027-07-07', '2026-07-21'],
        ['OKKIOR20', 169, 0, '2027-06-12', '2026-07-18'],
        ['OJCBT4', 238, 72, '2027-04-05', '2026-05-18'],
        ['OJCMO4', 93, 72, '2027-03-19', '2026-07-01'],
    ];

    public function test_report_merges_penerimaan_and_expired_in_one_row(): void
    {
        $this->makeClusterMaster('BRG-A', 'SAP-A', 'Small Cup');
        $this->makeItem('BRG-A');

        $this->getJson('/api/v1/reports/penerimaan-batch-expired')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 1)
            // Cluster ikut terbaca lewat join NPN → standar_umur_produk.
            ->assertJsonPath('data.0.cluster', 'Small Cup')
            ->assertJsonPath('data.0.kode_barang', 'BRG-A')
            ->assertJsonPath('data.0.tanggal_penerimaan', '2026-09-01')
            ->assertJsonPath('data.0.tanggal_expired', '2026-12-01')
            ->assertJsonPath('data.0.qty_dus_ball', 10)
            ->assertJsonPath('data.0.qty_pcs', 240)
            // WEEKDAY + SISA SIMPAN dihitung di server dengan definisi yang
            // sama dengan formula di file Excel.
            ->assertJsonPath('data.0.weekday', 'Future')
            ->assertJsonPath('data.0.is_expired', false)
            ->assertJsonPath('data.0.sisa_simpan', '0 Thn 3 Bln 0 Hr')
            ->assertJsonPath('data.0.sisa_hari', 57);
    }

    public function test_rows_are_grouped_by_cluster(): void
    {
        $this->makeClusterMaster('BRG-A', 'SAP-A', 'Zulu');
        $this->makeClusterMaster('BRG-B', 'SAP-B', 'Alpha');
        $this->makeClusterMaster('BRG-C', 'SAP-C', 'Alpha');

        $this->makeItem('BRG-A');
        $this->makeItem('BRG-B');
        $this->makeItem('BRG-C');

        $clusters = $this->getJson('/api/v1/reports/penerimaan-batch-expired')
            ->assertOk()
            ->json('data.*.cluster');

        // Terurut berdasarkan cluster: Alpha mendahului Zulu, dan kedua baris
        // Alpha berdampingan.
        $this->assertSame(['Alpha', 'Alpha', 'Zulu'], $clusters);
    }

    public function test_expired_rows_are_flagged_past(): void
    {
        $this->makeClusterMaster('BRG-A', 'SAP-A', 'Small Cup');
        $this->makeItem('BRG-A', '2026-10-01');

        $this->getJson('/api/v1/reports/penerimaan-batch-expired')
            ->assertOk()
            ->assertJsonPath('data.0.weekday', 'Past')
            ->assertJsonPath('data.0.is_expired', true)
            ->assertJsonPath('data.0.sisa_hari', -4)
            ->assertJsonPath('summary.item_expired', 1)
            ->assertJsonPath('summary.item_future', 0);
    }

    public function test_status_filter_splits_expired_and_future(): void
    {
        $this->makeClusterMaster('BRG-A', 'SAP-A', 'Small Cup');
        $this->makeItem('BRG-A', '2026-10-01');
        $this->makeItem('BRG-B', '2026-12-01');

        $this->getJson('/api/v1/reports/penerimaan-batch-expired?status=EXPIRED')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 1)
            ->assertJsonPath('data.0.kode_barang', 'BRG-A');

        $this->getJson('/api/v1/reports/penerimaan-batch-expired?status=FUTURE')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 1)
            ->assertJsonPath('data.0.kode_barang', 'BRG-B');
    }

    public function test_cluster_and_depot_filters_are_applied(): void
    {
        $this->makeClusterMaster('BRG-A', 'SAP-A', 'Small Cup');
        $this->makeClusterMaster('BRG-B', 'SAP-B', 'Big Cup');
        $this->makeItem('BRG-A');
        $this->makeItem('BRG-B');

        $this->getJson('/api/v1/reports/penerimaan-batch-expired?cluster=Big%20Cup')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 1)
            ->assertJsonPath('data.0.kode_barang', 'BRG-B');

        $this->getJson('/api/v1/reports/penerimaan-batch-expired?kode_depo=0127')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 2);
    }

    public function test_search_escapes_like_wildcards(): void
    {
        $this->makeItem('BRG-A');
        $this->makeItem('BRG-A%X');

        // '%' diperlakukan literal: hanya baris yang benar-benar memuat '%'.
        $this->getJson('/api/v1/reports/penerimaan-batch-expired?search='.urlencode('%'))
            ->assertOk()
            ->assertJsonPath('summary.total_item', 1)
            ->assertJsonPath('data.0.kode_barang', 'BRG-A%X');
    }

    public function test_rows_without_master_still_appear_with_fallback_cluster(): void
    {
        // Tidak ada master NPN/standar umur untuk kode ini.
        $this->makeItem('BRG-X');

        $this->getJson('/api/v1/reports/penerimaan-batch-expired')
            ->assertOk()
            ->assertJsonPath('summary.total_item', 1)
            ->assertJsonPath('data.0.cluster', 'TANPA CLUSTER');
    }

    public function test_principal_falls_back_to_standar_umur_when_cluster_principal_missing(): void
    {
        // Format SKU di cluster_principal (JDO1/JDO1) tidak sama dengan
        // nickname NPN (JDO1A), jadi join CP meleset — principal harus jatuh
        // ke standar_umur_produk.principal (GBS), bukan "-".
        Npn::create([
            'BOSnetszProductId' => '90103211143100',
            'SAPszProductId' => 'SAP-JDO1A',
            'szNickName' => 'JDO1A',
            'szStatus' => 'EXISTING',
        ]);

        StandarUmurProduk::create([
            'material' => 'SAP-JDO1A',
            'material_description' => 'OKKY Jelly Drink Jeruk',
            'cluster' => 'Small Cup',
            'principal' => 'GBS',
            'umur' => 24,
        ]);

        $this->makeItem('90103211143100');

        $this->getJson('/api/v1/reports/penerimaan-batch-expired')
            ->assertOk()
            ->assertJsonPath('data.0.cluster', 'Small Cup')
            ->assertJsonPath('data.0.sku', 'JDO1A')
            ->assertJsonPath('data.0.principal_1', 'GBS')
            ->assertJsonPath('data.0.principal_2', '-');
    }

    public function test_principal_survives_nickname_change_via_stable_id(): void
    {
        // Kode produk boleh berubah (nickname NPN diganti), tetapi
        // BOSnetszProductId tidak — principal harus tetap dari baris
        // cluster_principal yang sama, bukan jatuh ke fallback.
        Npn::create([
            'BOSnetszProductId' => '90103211143100',
            'SAPszProductId' => 'SAP-JDO1A',
            'szNickName' => 'JDO1A',
            'szNickNameNew' => 'OJDJE8',
            'szStatus' => 'EXISTING',
        ]);

        StandarUmurProduk::create([
            'material' => 'SAP-JDO1A',
            'material_description' => 'OKKY Jelly Drink Jeruk',
            'cluster' => 'Small Cup',
            'principal' => 'GBS',
            'umur' => 24,
        ]);

        ClusterPrincipal::create([
            'product_sku' => 'OJDJE8/JDO1A',
            'principal_1' => 'KHUSUS',
            'principal_2' => 'KHUSUS-Sub',
        ]);

        $this->makeItem('90103211143100');

        // Kode produk berubah di master NPN — join nickname putus.
        Npn::query()->update(['szNickName' => 'XXX99', 'szNickNameNew' => 'YYY99']);

        $this->getJson('/api/v1/reports/penerimaan-batch-expired')
            ->assertOk()
            ->assertJsonPath('data.0.principal_1', 'KHUSUS')
            ->assertJsonPath('data.0.principal_2', 'KHUSUS-Sub');
    }

    public function test_simplified_import_resolves_sku_and_auto_fills_from_master(): void
    {
        $this->seedMasterFor([['ESVAG150', 0, 0, '2027-07-07', '2026-07-16']]);

        $import = new ReceivingItemImport($this->user);
        $import->collection(collect([
            [
                // 5 kolom sesuai template baru — operator tidak mengisi
                // kode_barang, nama_barang, depo, maupun satuan.
                'produk' => 'ESVAG150',
                'qty_dusball' => '2',
                'qty_pcs' => '8',
                'expired' => '2027-07-07',
                'tanggal_penerimaan' => '2026-07-16',
            ],
        ]));

        $this->assertSame(1, $import->imported);
        $this->assertSame(0, $import->skipped);

        $item = ReceivingItem::first();

        // PRODUK tersimpan sebagai kode resmi hasil lookup NPN.
        $this->assertSame('BOSESVAG150', $item->kode_barang);
        // nama_barang diambil dari NPN (szShortDescription), bukan dari
        // apa yang diketik operator.
        $this->assertSame('ESVAG150 - Produk ESVAG150', $item->nama_barang);

        // CLUSTER + PRINCIPAL ikut terisi otomatis di laporan.
        $rows = $this->getJson('/api/v1/reports/penerimaan-batch-expired')
            ->assertOk()
            ->json('data');
        $this->assertSame('ESVAG150', $rows[0]['sku']);
        $this->assertSame('ABBOTT', $rows[0]['principal_1']);
        $this->assertSame('ABBOTT Sub', $rows[0]['principal_2']);
    }

    public function test_legacy_import_columns_still_work(): void
    {
        $this->makeClusterMaster('KODE-LAMA', 'SAP-LAMA', 'Small Cup');

        $import = new ReceivingItemImport($this->user);
        $import->collection(collect([
            [
                'kode_barang' => 'KODE-LAMA',
                'qty_crt_zak' => '10',
                'tgl_expired_date' => '2026-12-01',
            ],
        ]));

        $this->assertSame(1, $import->imported);
        $this->assertSame('KODE-LAMA', ReceivingItem::first()->kode_barang);
    }

    public function test_pcs_falls_back_to_conversion_factor_when_qty_pcs_null(): void
    {
        $this->makeClusterMaster('BRG-A', 'SAP-A', 'Small Cup');

        ReceivingItem::create([
            'source' => 'VALIDASI_SJ',
            'kode_barang' => 'BRG-A',
            'actual_qty' => 10,
            'qty_pcs' => null,
            'conversion_factor' => 24,
            'expired_date' => '2026-12-01',
            'tanggal_penerimaan' => '2026-09-01',
            'kode_depo' => '0127',
        ]);

        $this->getJson('/api/v1/reports/penerimaan-batch-expired')
            ->assertOk()
            ->assertJsonPath('data.0.qty_pcs', 240);
    }

    public function test_export_contains_formulas_and_marks_expired_rows_red(): void
    {
        $this->makeClusterMaster('BRG-A', 'SAP-A', 'Small Cup');
        $this->makeItem('BRG-A', '2026-10-01'); // lewat tanggal → merah

        $response = $this->get('/api/v1/reports/penerimaan-batch-expired/export');
        $response->assertOk()
            ->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        $this->assertStringContainsString('laporan-penerimaan-expired-produk', $response->headers->get('content-disposition'));

        $sheet = $this->sheetFromResponse($response->streamedContent());

        $this->assertSame(
            ['NO', 'GROUPING BY CLUSTER', 'PRODUK', 'NAMA PRODUK', 'PRINCIPAL 1',
                'PRINCIPAL 2', 'DUS/BALL', 'PCS', 'TANGGAL EXPIRED',
                'TANGGAL PENERIMAAN', 'WEEKDAY', 'SISA SIMPAN', 'SISA HARI'],
            $sheet->rangeToArray('A1:M1')[0]
        );

        // WEEKDAY & SISA SIMPAN harus formula Excel, bukan teks beku, supaya
        // ikut bergerak saat file dibuka di hari berikutnya.
        $weekday = $sheet->getCell('K2')->getValue();
        $this->assertStringStartsWith('=', $weekday);
        $this->assertStringContainsString('TODAY()', $weekday);
        $this->assertStringContainsString('"Future"', $weekday);
        // Rumus menunjuk persis ke kolom expired (I) sesuai format standar.
        $this->assertStringContainsString('I2>TODAY()', $weekday);

        $sisaSimpan = $sheet->getCell('L2')->getValue();
        $this->assertStringStartsWith('=', $sisaSimpan);
        $this->assertStringContainsString('DATEDIF(J2,I2,"Y")', $sisaSimpan);

        // Baris expired dicorat merah otomatis.
        $this->assertSame('FEE2E2', $sheet->getStyle('A2')->getFill()->getStartColor()->getRGB());
    }

    public function test_export_dates_are_real_excel_dates_so_formulas_evaluate(): void
    {
        $this->makeClusterMaster('BRG-A', 'SAP-A', 'Small Cup');
        $this->makeItem('BRG-A', '2026-12-01');

        $sheet = $this->sheetFromResponse(
            $this->get('/api/v1/reports/penerimaan-batch-expired/export')->streamedContent()
        );

        // TANGGAL EXPIRED harus ANGKA (serial Excel), bukan teks. Kalau teks,
        // IF(I2>TODAY()) membandingkan string dengan angka dan selalu bernilai
        // SALAH — semua batch berbulan-bulan ke depan akan terbaca "Past".
        $expiredCell = $sheet->getCell('I2');
        $this->assertIsNumeric(
            $expiredCell->getValue(),
            'TANGGAL EXPIRED harus serial angka Excel, bukan string tanggal'
        );

        // Rumusnya benar-benar dievaluasi dan menghasilkan "Future", bukan
        // sekadar string formula yang belum pernah dihitung.
        $this->assertSame('Future', $sheet->getCell('K2')->getCalculatedValue());
        $this->assertSame('0 Thn 3 Bln 0 Hr', $sheet->getCell('L2')->getCalculatedValue());
    }

    public function test_export_does_not_mark_future_rows_red(): void
    {
        $this->makeClusterMaster('BRG-A', 'SAP-A', 'Small Cup');
        $this->makeItem('BRG-A', '2026-12-01');

        $sheet = $this->sheetFromResponse(
            $this->get('/api/v1/reports/penerimaan-batch-expired/export')->streamedContent()
        );

        $this->assertNotSame('FEE2E2', $sheet->getStyle('A2')->getFill()->getStartColor()->getRGB());
    }

    public function test_pagination_numbers_rows_continuously(): void
    {
        $this->makeClusterMaster('BRG-A', 'SAP-A', 'Small Cup');

        for ($i = 1; $i <= 30; $i++) {
            $this->makeItem('BRG-A');
        }

        $page2 = $this->getJson('/api/v1/reports/penerimaan-batch-expired?per_page=25&page=2')->assertOk();
        $this->assertCount(5, $page2->json('data'));
        // Nomor urut lanjut dari halaman sebelumnya, bukan mulai dari 1 lagi.
        $this->assertSame(26, $page2->json('data.0.no'));
        $this->assertSame(30, $page2->json('summary.total_item'));
    }

    public function test_user_without_permission_is_rejected(): void
    {
        $noAccess = User::create([
            'email' => 'no-access@test.com',
            'password' => 'password',
            'full_name' => 'No Access',
            'kode_depo' => '0000',
            'nama_depo' => 'Kantor Pusat',
            'level' => 'admin_distirbusi',
            'status' => 'active',
        ]);
        Sanctum::actingAs($noAccess);

        $this->getJson('/api/v1/reports/penerimaan-batch-expired')->assertForbidden();
    }

    private function sheetFromResponse(string $content): Worksheet
    {
        $path = tempnam(sys_get_temp_dir(), 'exp').'.xlsx';
        file_put_contents($path, $content);

        try {
            return IOFactory::load($path)->getActiveSheet();
        } finally {
            @unlink($path);
        }
    }
}
