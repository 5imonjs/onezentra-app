<?php

namespace Tests\Feature;

use App\Imports\NpnImport;
use App\Models\Npn;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Tests\TestCase;

class NpnImportTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::create([
            'email' => 'npn-import@test.com',
            'password' => 'password',
            'full_name' => 'NPN Import Tester',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'staff_logistic',
            'status' => 'active',
        ]);
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function import(array $rows): NpnImport
    {
        $import = new NpnImport($this->user);
        $import->collection(new Collection($rows));

        return $import;
    }

    /**
     * SAP ID dan barcode boleh sama untuk dua produk BOSnet yang berbeda.
     * Import tidak boleh menimpa produk pertama hanya karena kolom sekunder
     * itu cocok — dulu CSP4OP menghapus CSP4OK dari master.
     */
    public function test_import_keeps_distinct_bos_products_even_when_sap_and_barcode_match(): void
    {
        $import = $this->import([
            [
                'bosnetszproductid' => 'B-CSP4OK',
                'sapszproductid' => 'S-CSP4',
                'szbarcode' => 'BC-CSP4',
                'sznickname' => 'CSP4OK',
                'sznicknamenew' => 'CSP4OK NEW',
                'szshortdescription' => 'Deskripsi sama',
            ],
            [
                'bosnetszproductid' => 'B-CSP4OP',
                'sapszproductid' => 'S-CSP4',
                'szbarcode' => 'BC-CSP4',
                'sznickname' => 'CSP4OP',
                'sznicknamenew' => 'CSP4OP NEW',
                'szshortdescription' => 'Deskripsi sama',
            ],
        ]);

        $this->assertSame(2, $import->imported);
        $this->assertSame(0, $import->updated);
        $this->assertDatabaseCount('npn', 2);

        $this->assertDatabaseHas('npn', [
            'BOSnetszProductId' => 'B-CSP4OK',
            'szNickName' => 'CSP4OK',
            'SAPszProductId' => 'S-CSP4',
        ]);
        $this->assertDatabaseHas('npn', [
            'BOSnetszProductId' => 'B-CSP4OP',
            'szNickName' => 'CSP4OP',
            'SAPszProductId' => 'S-CSP4',
        ]);
    }

    /**
     * Spasi di ujung sel Excel tidak boleh membuat baris duplikat. Kode yang
     * sama harus tetap meng-update baris lama, bukan menambah baris baru.
     */
    public function test_import_trims_codes_and_updates_the_same_bos_product(): void
    {
        $existing = Npn::create([
            'BOSnetszProductId' => 'B-CSP4OK',
            'SAPszProductId' => 'S-OLD',
            'szBarcode' => 'BC-OLD',
            'szNickName' => 'CSP4OK LAMA',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
        ]);

        $import = $this->import([[
            'bosnetszproductid' => '  B-CSP4OK  ',
            'sapszproductid' => 'S-NEW',
            'szbarcode' => 'BC-NEW',
            'sznickname' => 'CSP4OK BARU',
        ]]);

        $this->assertSame(0, $import->imported);
        $this->assertSame(1, $import->updated);
        $this->assertDatabaseCount('npn', 1);
        $this->assertDatabaseHas('npn', [
            'id' => $existing->id,
            'BOSnetszProductId' => 'B-CSP4OK',
            'szNickName' => 'CSP4OK BARU',
            'SAPszProductId' => 'S-NEW',
        ]);
    }

    /**
     * Baris legacy yang belum punya BOS ID masih boleh dilengkapi lewat SAP ID
     * atau barcode. Ini menjaga data lama tetap termigrasi, bukan diduplikasi.
     */
    public function test_import_can_fill_missing_bos_id_on_a_legacy_row(): void
    {
        $legacy = Npn::create([
            'SAPszProductId' => 'S-LEGACY',
            'szBarcode' => 'BC-LEGACY',
            'szNickName' => 'PRODUK LEGACY',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
        ]);

        $import = $this->import([[
            'bosnetszproductid' => 'B-CSP4OK',
            'sapszproductid' => 'S-LEGACY',
            'szbarcode' => 'BC-LEGACY',
            'sznickname' => 'CSP4OK',
        ]]);

        $this->assertSame(0, $import->imported);
        $this->assertSame(1, $import->updated);
        $this->assertDatabaseCount('npn', 1);
        $this->assertDatabaseHas('npn', [
            'id' => $legacy->id,
            'BOSnetszProductId' => 'B-CSP4OK',
            'szNickName' => 'CSP4OK',
        ]);
    }
}
