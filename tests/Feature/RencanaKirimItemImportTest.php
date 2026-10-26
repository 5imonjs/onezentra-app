<?php

namespace Tests\Feature;

use App\Imports\RencanaKirimItemImport;
use App\Models\Npn;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Tests\TestCase;

class RencanaKirimItemImportTest extends TestCase
{
    use RefreshDatabase;

    public function test_imported_item_uses_nickname_not_shared_short_description(): void
    {
        Npn::create([
            'BOSnetszProductId' => 'B-CSP4OK',
            'SAPszProductId' => 'S-CSP4',
            'szNickName' => 'CSP4OK',
            'szNickNameNew' => 'CSP4OK NEW',
            'szShortDescription' => 'Deskripsi Sama',
            'szStatus' => 'EXISTING',
        ]);

        $import = new RencanaKirimItemImport;
        $import->collection(new Collection([[
            'kode_barang' => 'B-CSP4OK',
            'nama_barang' => 'Deskripsi Sama',
            'jumlah' => 2,
            'satuan' => 'CRT',
        ]]));

        $this->assertSame(1, $import->matched);
        $this->assertSame('CSP4OK', $import->items[0]['nama_barang']);
    }

    public function test_imported_item_falls_back_to_new_nickname(): void
    {
        Npn::create([
            'BOSnetszProductId' => 'B-CSP4OP',
            'szNickNameNew' => 'CSP4OP NEW',
            'szShortDescription' => 'Deskripsi Lain',
            'szStatus' => 'EXISTING',
        ]);

        $import = new RencanaKirimItemImport;
        $import->collection(new Collection([[
            'nama_barang' => 'CSP4OP NEW',
            'jumlah' => 1,
        ]]));

        $this->assertSame(1, $import->matched);
        $this->assertSame('CSP4OP NEW', $import->items[0]['nama_barang']);
    }
}
