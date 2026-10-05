<?php

namespace Tests\Feature;

use App\Models\ClusterPrincipal;
use App\Models\Npn;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

class ClusterPrincipalTest extends TestCase
{
    use RefreshDatabase;

    /** Header persis seperti file sumber user. */
    private const HEADERS = [
        'LOB', 'Product Category', 'Sub Product Category', 'Product Group',
        'Product Class', 'Product SKU', 'Principal 1', 'Principal 2',
    ];

    private function userWithPermissions(array $slugs): User
    {
        $role = Role::firstOrCreate(['slug' => '_cp_admin'], ['name' => 'CP Admin', 'slug' => '_cp_admin']);
        foreach ($slugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Cluster Principal']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }

        $user = User::create([
            'email' => 'cp-'.uniqid().'@example.com',
            'password' => 'password',
            'full_name' => 'CP Test User',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'admin_master',
            'status' => 'active',
        ]);
        $role->users()->attach($user->id);

        return $user->fresh();
    }

    /**
     * Baris dari file sumber user. `principal_2` sengaja berisi "#N/A" pada
     * beberapa baris — persis seperti file aslinya.
     */
    private function sampleRows(): array
    {
        return [
            ['DAIRY & DAIRY', 'LIQUID MILK', 'STERILLIZED', 'Milk', 'FLAVORED MILK DRINK', 'TPECO110', 'ABBOTT', 'ABBOTT-Pediasure'],
            ['DAIRY & DAIRY', 'LIQUID MILK', 'STERILLIZED', 'Milk', 'FLAVORED MILK DRINK', 'TPEVA110', 'ABBOTT', 'ABBOTT-Pediasure'],
            ['DAIRY & DAIRY', 'Powder Milk', 'Gump 1+', 'Premium', 'Box', 'ESVAG150', 'ABBOTT', 'ABBOTT-Ensure'],
            ['DAIRY & DAIRY', 'Powder Milk', 'Gump 1+', 'Premium', 'Can', 'PEMILK400', 'ABBOTT', '#N/A'],
            ['Food', 'Bread/Soft Cake', 'BREAD/SOFT CAKE', 'CROISSANT', 'CHOCOLATE', 'PCBC03', 'BAUH', '#N/A'],
        ];
    }

    private function upload(array $rows, string $name = 'cp.xlsx'): UploadedFile
    {
        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->fromArray(self::HEADERS, null, 'A1');
        $sheet->fromArray($rows, null, 'A2');

        ob_start();
        (new Xlsx($spreadsheet))->save('php://output');

        return UploadedFile::fake()->createWithContent($name, (string) ob_get_clean());
    }

    private function importRows(array $rows)
    {
        return $this->post('/api/v1/cluster-principal/import', ['file' => $this->upload($rows)]);
    }

    /**
     * Import adalah jalur utama modul ini, jadi heading exact seperti file user
     * harus bisa diterima tanpa perlu mengganti nama kolom.
     */
    public function test_import_accepts_user_source_headers(): void
    {
        Sanctum::actingAs($this->userWithPermissions(['cluster_principal.view', 'cluster_principal.create']));

        $this->importRows($this->sampleRows())->assertOk();
        $this->assertSame(5, ClusterPrincipal::count());

        $row = ClusterPrincipal::where('product_sku', 'TPECO110')->firstOrFail();
        $this->assertSame('DAIRY & DAIRY', $row->lob);
        $this->assertSame('LIQUID MILK', $row->product_category);
        $this->assertSame('STERILLIZED', $row->sub_product_category);
        $this->assertSame('FLAVORED MILK DRINK', $row->product_class);
        $this->assertSame('ABBOTT-Pediasure', $row->principal_2);
    }

    /** "#N/A" di file berarti "tidak ada", bukan teks yang boleh disimpan. */
    public function test_import_normalizes_na_marker_to_null(): void
    {
        Sanctum::actingAs($this->userWithPermissions(['cluster_principal.view', 'cluster_principal.create']));

        $this->importRows($this->sampleRows())->assertOk();

        $row = ClusterPrincipal::where('product_sku', 'PEMILK400')->firstOrFail();
        $this->assertNull($row->principal_2, '"#N/A" harus menjadi null, bukan string');
        $this->assertSame('ABBOTT', $row->principal_1, 'Principal 1 tidak boleh ikut terhapus');
    }

    /** Import ulang dengan SKU sama harus memperbarui, bukan menggandakan. */
    public function test_import_is_idempotent_on_product_sku(): void
    {
        Sanctum::actingAs($this->userWithPermissions(['cluster_principal.view', 'cluster_principal.create']));

        $this->importRows($this->sampleRows())->assertOk();

        $rows = $this->sampleRows();
        $rows[0][6] = 'NESTLE'; // Principal 1 SKU pertama berubah di file kedua.
        $this->importRows($rows)->assertOk();

        $this->assertSame(5, ClusterPrincipal::count(), 'SKU sama tidak boleh menggandakan baris');
        $this->assertSame('NESTLE', ClusterPrincipal::where('product_sku', 'TPECO110')->firstOrFail()->principal_1);
    }

    /**
     * Kunci stabil diisi otomatis saat import: SKU komposit file sumber
     * (NICKNEW/NICK) dipetakan ke BOSnetszProductId/SAPszProductId NPN supaya
     * join laporan tahan terhadap perubahan nickname.
     */
    public function test_import_resolves_stable_ids_from_npn(): void
    {
        Sanctum::actingAs($this->userWithPermissions(['cluster_principal.view', 'cluster_principal.create']));

        Npn::create([
            'BOSnetszProductId' => '90103211143100',
            'SAPszProductId' => '9000002608',
            'szNickName' => 'JDO1A',
            'szNickNameNew' => 'OJDJE8',
            'szStatus' => 'EXISTING',
        ]);

        $this->importRows([
            ['Beverage', 'Juice', 'Jelly Drink', 'Flavour', 'Fruity', 'OJDJE8/JDO1A', 'GBS', null],
        ])->assertOk();

        $row = ClusterPrincipal::where('product_sku', 'OJDJE8/JDO1A')->firstOrFail();
        $this->assertSame('90103211143100', $row->bosnetsz_product_id);
        $this->assertSame('9000002608', $row->sap_product_id);
    }

    /** Ganti SKU lewat CRUD ikut menghitung ulang kunci stabil. */
    public function test_update_recomputes_stable_ids_when_sku_changes(): void
    {
        Sanctum::actingAs($this->userWithPermissions([
            'cluster_principal.view', 'cluster_principal.create', 'cluster_principal.edit',
        ]));

        Npn::create([
            'BOSnetszProductId' => '90103211143100',
            'SAPszProductId' => '9000002608',
            'szNickName' => 'JDO1A',
            'szNickNameNew' => 'OJDJE8',
            'szStatus' => 'EXISTING',
        ]);

        $id = $this->postJson('/api/v1/cluster-principal', [
            'product_sku' => 'SKU-LAMA',
            'principal_1' => 'GBS',
        ])->assertCreated()->json('data.id');

        $this->assertNull(ClusterPrincipal::findOrFail($id)->bosnetsz_product_id);

        $this->putJson("/api/v1/cluster-principal/$id", [
            'product_sku' => 'OJDJE8/JDO1A',
            'principal_1' => 'GBS',
        ])->assertOk();

        $this->assertSame(
            '90103211143100',
            ClusterPrincipal::findOrFail($id)->bosnetsz_product_id,
            'ganti SKU harus menghitung ulang kunci stabil'
        );
    }

    /** Baris tanpa SKU tidak bisa di-update pada import berikutnya, jadi dilewati. */
    public function test_import_skips_rows_without_product_sku(): void
    {
        Sanctum::actingAs($this->userWithPermissions(['cluster_principal.view', 'cluster_principal.create']));

        $res = $this->importRows([
            ['DAIRY & DAIRY', 'LIQUID MILK', 'STERILLIZED', 'Milk', 'FLAVORED', 'TPECO110', 'ABBOTT', null],
            ['DAIRY & DAIRY', 'Powder Milk', 'Gump 1+', 'Premium', 'Box', null, 'ABBOTT', null],
        ])->assertOk();

        $this->assertSame(1, ClusterPrincipal::count());
        $this->assertSame(1, $res->json('skipped'), 'baris tanpa SKU harus dilaporkan, bukan hilang diam-diam');
    }

    /** SKU wajib ada dan unik — tanpa ini import akan menduplikasi referensi. */
    public function test_product_sku_is_required_and_unique(): void
    {
        Sanctum::actingAs($this->userWithPermissions(['cluster_principal.view', 'cluster_principal.create', 'cluster_principal.edit']));

        $this->postJson('/api/v1/cluster-principal', ['lob' => 'Food'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['product_sku']);

        ClusterPrincipal::create(['product_sku' => 'TPECO110', 'principal_1' => 'ABBOTT']);

        $this->postJson('/api/v1/cluster-principal', ['product_sku' => 'TPECO110'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['product_sku']);
    }

    /**
     * Filter principal harus menjangkau kolom 1 DAN kolom 2. Kalau hanya kolom 1,
     * produk yang principal-nya ada di kolom 2 akan hilang dari hasil filter.
     */
    public function test_principal_filter_covers_both_columns(): void
    {
        Sanctum::actingAs($this->userWithPermissions(['cluster_principal.view']));

        ClusterPrincipal::create(['product_sku' => 'A1', 'principal_1' => 'ABBOTT']);
        ClusterPrincipal::create(['product_sku' => 'B1', 'principal_2' => 'PEDIASURE']);

        $this->getJson('/api/v1/cluster-principal?principal=ABBOTT')->assertOk()->assertJsonPath('total', 1);
        $this->getJson('/api/v1/cluster-principal?principal=PEDIASURE')->assertOk()->assertJsonPath('total', 1);

        // Dropdown filter harus memuat nilai dari kedua kolom.
        $filters = $this->getJson('/api/v1/cluster-principal/filters')->assertOk()->json('data');
        $this->assertContains('ABBOTT', $filters['principal']);
        $this->assertContains('PEDIASURE', $filters['principal']);
    }

    public function test_crud_roundtrip(): void
    {
        Sanctum::actingAs($this->userWithPermissions([
            'cluster_principal.view', 'cluster_principal.create',
            'cluster_principal.edit', 'cluster_principal.delete',
        ]));

        $id = $this->postJson('/api/v1/cluster-principal', [
            'product_sku' => 'TPECO110',
            'lob' => 'DAIRY & DAIRY',
            'principal_1' => 'ABBOTT',
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/v1/cluster-principal/$id")->assertOk()->assertJsonPath('data.product_sku', 'TPECO110');

        $this->putJson("/api/v1/cluster-principal/$id", ['product_sku' => 'TPECO110', 'principal_1' => 'NESTLE'])
            ->assertOk()
            ->assertJsonPath('data.principal_1', 'NESTLE');

        $this->deleteJson("/api/v1/cluster-principal/$id")->assertOk();
        $this->assertSame(0, ClusterPrincipal::count());
    }

    /** Master data ini global — user depo biasa tetap boleh melihatnya. */
    public function test_depot_scoped_user_can_read_global_master(): void
    {
        $user = $this->userWithPermissions(['cluster_principal.view']);
        $user->update(['level' => 'sac', 'kode_depo' => 'DPO', 'nama_depo' => 'Depo Test']);
        Sanctum::actingAs($user->fresh());

        ClusterPrincipal::create(['product_sku' => 'TPECO110']);

        $this->getJson('/api/v1/cluster-principal')->assertOk()->assertJsonPath('total', 1);
    }

    public function test_permissions_are_enforced(): void
    {
        Sanctum::actingAs($this->userWithPermissions(['cluster_principal.view']));

        $this->getJson('/api/v1/cluster-principal')->assertOk();
        $this->postJson('/api/v1/cluster-principal', ['product_sku' => 'X1'])->assertStatus(403);

        $id = ClusterPrincipal::create(['product_sku' => 'Y1'])->id;
        $this->putJson("/api/v1/cluster-principal/$id", ['product_sku' => 'Y1'])->assertStatus(403);
        $this->deleteJson("/api/v1/cluster-principal/$id")->assertStatus(403);
    }

    /** Template harus bisa langsung diisi user: headingnya sama dengan UI. */
    public function test_template_downloads_with_ui_headings(): void
    {
        Sanctum::actingAs($this->userWithPermissions(['cluster_principal.view']));

        $res = $this->get('/api/v1/cluster-principal/template')->assertOk();

        $temp = tempnam(sys_get_temp_dir(), 'cp');
        file_put_contents($temp, $res->streamedContent() ?: $res->getContent());

        $rows = (new \PhpOffice\PhpSpreadsheet\Reader\Xlsx)->load($temp)->getActiveSheet()->toArray();

        $this->assertSame(self::HEADERS, array_slice($rows[0], 0, 8));
        unlink($temp);
    }
}
