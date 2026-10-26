<?php

namespace Tests\Feature;

use App\Models\Npn;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NpnSearchProductTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @param  array<int, string>  $slugs
     */
    private function userWith(array $slugs): User
    {
        $user = User::create([
            'email' => 'npn-search@example.com',
            'password' => 'password',
            'full_name' => 'NPN Search Tester',
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'level' => 'operator',
            'status' => 'active',
        ]);

        $role = Role::firstOrCreate(['slug' => 'npn_search_tester'], ['name' => 'NPN Search Tester']);
        foreach ($slugs as $slug) {
            $perm = Permission::firstOrCreate(['slug' => $slug], ['name' => $slug, 'menu_group' => 'Test']);
            $role->permissions()->syncWithoutDetaching([$perm->id]);
        }
        $role->users()->attach($user->id);

        return $user;
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function product(array $attributes = []): Npn
    {
        return Npn::create(array_merge([
            'BOSnetszProductId' => 'B-'.uniqid('', false),
            'szNickName' => 'PRODUK '.uniqid('', false),
            'szStatus' => 'EXISTING',
        ], $attributes));
    }

    /**
     * Batas halaman dulu memotong hasil secara diam-diam (500 pertama urut
     * szNickName). Sekarang `limit` hanya ukuran halaman: `total` + `has_more`
     * memberi tahu klien sisa datanya dan offset menarik halaman berikutnya.
     */
    public function test_search_product_reports_total_and_paginates(): void
    {
        Sanctum::actingAs($this->userWith(['npn.view']));

        $this->product(['szNickName' => 'MINYAK ONE', 'BOSnetszProductId' => 'B-M1']);
        $this->product(['szNickName' => 'MINYAK DUA', 'BOSnetszProductId' => 'B-M2']);
        $this->product(['szNickName' => 'MINYAK TIGA', 'BOSnetszProductId' => 'B-M3']);

        $first = $this->getJson('/api/v1/npn/search-product?q=MINYAK&limit=2');
        $first->assertOk()
            ->assertJsonPath('total', 3)
            ->assertJsonPath('limit', 2)
            ->assertJsonPath('offset', 0)
            ->assertJsonPath('has_more', true)
            ->assertJsonCount(2, 'data');

        $second = $this->getJson('/api/v1/npn/search-product?q=MINYAK&limit=2&offset=2');
        $second->assertOk()
            ->assertJsonPath('total', 3)
            ->assertJsonPath('has_more', false)
            ->assertJsonCount(1, 'data');

        // Kedua halaman bersama-sama memuat ketiga produk — tak ada baris yang
        // terpotong diam-diam di balik batas halaman.
        $this->assertSame(
            ['MINYAK DUA', 'MINYAK ONE', 'MINYAK TIGA'],
            array_merge(
                array_column($first->json('data'), 'szNickName'),
                array_column($second->json('data'), 'szNickName')
            )
        );

        // Tanpa parameter, ukuran halaman baku tetap 500.
        $this->getJson('/api/v1/npn/search-product?q=MINYAK')
            ->assertOk()
            ->assertJsonPath('limit', 500)
            ->assertJsonPath('has_more', false);
    }

    /**
     * Picker "Nama Barang" tidak boleh membatasi status: dulu query memakai
     * `where('szStatus', 'EXISTING')` sehingga produk berstatus A/DEL ada di
     * halaman NPN tetapi tidak pernah muncul di form Rencana Kirim.
     */
    public function test_search_product_returns_products_in_every_status(): void
    {
        Sanctum::actingAs($this->userWith(['npn.view']));

        $this->product(['szNickName' => 'PRODUK AKTIF', 'BOSnetszProductId' => 'B-A', 'szStatus' => 'A']);
        $this->product(['szNickName' => 'PRODUK DELETED', 'BOSnetszProductId' => 'B-DEL', 'szStatus' => 'DEL']);
        $this->product(['szNickName' => 'PRODUK EXISTING', 'BOSnetszProductId' => 'B-EX', 'szStatus' => 'EXISTING']);

        $codes = array_column(
            $this->getJson('/api/v1/npn/search-product?q=PRODUK')->assertOk()->json('data'),
            'BOSnetszProductId'
        );
        sort($codes);

        $this->assertSame(['B-A', 'B-DEL', 'B-EX'], $codes);
    }

    /**
     * User bisa mencari lewat nickname lama maupun baru, dan kedua kolom itu
     * harus ikut dikirim agar picker bisa menampilkan nama produknya.
     */
    public function test_search_product_matches_and_returns_both_nickname_columns(): void
    {
        Sanctum::actingAs($this->userWith(['npn.view']));

        $this->product([
            'szNickName' => 'NICK LAMA',
            'szNickNameNew' => 'NICK BARU',
            'szShortDescription' => 'Deskripsi Produk',
            'BOSnetszProductId' => 'B-NICK',
        ]);

        foreach (['NICK LAMA', 'NICK BARU'] as $keyword) {
            $rows = $this->getJson('/api/v1/npn/search-product?q='.urlencode($keyword))
                ->assertOk()
                ->json('data');

            $this->assertCount(1, $rows, "Kata kunci {$keyword} harus menemukan produk.");
            $this->assertSame('NICK LAMA', $rows[0]['szNickName']);
            $this->assertSame('NICK BARU', $rows[0]['szNickNameNew']);
        }
    }

    /**
     * Kata kunci user bisa berasal dari nama panjang atau deskripsi kategori
     * yang tidak pernah tampil di baris hasil.
     */
    public function test_search_product_matches_long_description_and_category(): void
    {
        Sanctum::actingAs($this->userWith(['npn.view']));

        $this->product(['szNickName' => 'PRODUK A', 'szLongDescription' => 'Tepung Terigu Premium Cakra Kenyal']);
        $this->product(['szNickName' => 'PRODUK B', 'szCat1Description' => 'Minyak Goreng Sawit']);
        $this->product(['szNickName' => 'PRODUK C']);

        $this->assertSame(
            ['PRODUK A'],
            array_column($this->getJson('/api/v1/npn/search-product?q=Cakra')->assertOk()->json('data'), 'szNickName')
        );

        $this->assertSame(
            ['PRODUK B'],
            array_column($this->getJson('/api/v1/npn/search-product?q=Goreng')->assertOk()->json('data'), 'szNickName')
        );
    }

    /**
     * Spasi dibuang di server; ketikan yang tinggal spasi jadi 422, bukan
     * pencarian '% %' yang mengembalikan baris ber-spasi acak.
     */
    public function test_search_product_trims_query_and_rejects_blank(): void
    {
        Sanctum::actingAs($this->userWith(['npn.view']));

        $this->product(['szNickName' => 'SUSU UHT COKLAT']);

        $padded = $this->getJson('/api/v1/npn/search-product?q='.urlencode('  SUSU  '));
        $padded->assertOk()->assertJsonCount(1, 'data');

        $this->getJson('/api/v1/npn/search-product?q='.urlencode('   '))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['q']);

        $this->getJson('/api/v1/npn/search-product?q=')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['q']);
    }

    /**
     * Wajib perbaikan LIKE: `%`/`_` dicari sebagai karakter biasa, bukan
     * wildcard (aturan testing.md — LIKE tanpa escape membuka pintu wildcard
     * yang membuat hasil salah di SQLite maupun MySQL).
     */
    public function test_search_product_treats_wildcards_as_literals(): void
    {
        Sanctum::actingAs($this->userWith(['npn.view']));

        $this->product(['szNickName' => 'GULA 50% MURNI']);
        $this->product(['szNickName' => 'GULA MURNI']);
        $this->product(['szNickName' => 'GULA_PASIR']);

        $percent = $this->getJson('/api/v1/npn/search-product?q='.urlencode('%'));
        $percent->assertOk();
        $this->assertSame(['GULA 50% MURNI'], array_column($percent->json('data'), 'szNickName'));

        $underscore = $this->getJson('/api/v1/npn/search-product?q='.urlencode('_'));
        $underscore->assertOk();
        $this->assertSame(['GULA_PASIR'], array_column($underscore->json('data'), 'szNickName'));
    }

    public function test_search_product_validates_pagination_bounds(): void
    {
        Sanctum::actingAs($this->userWith(['npn.view']));

        $this->getJson('/api/v1/npn/search-product?q=susu&limit=0')
            ->assertStatus(422)->assertJsonValidationErrors(['limit']);
        $this->getJson('/api/v1/npn/search-product?q=susu&limit=5000')
            ->assertStatus(422)->assertJsonValidationErrors(['limit']);
        $this->getJson('/api/v1/npn/search-product?q=susu&offset=-1')
            ->assertStatus(422)->assertJsonValidationErrors(['offset']);
    }

    public function test_search_product_requires_npn_view(): void
    {
        Sanctum::actingAs($this->userWith([]));

        $this->getJson('/api/v1/npn/search-product?q=susu')->assertForbidden();
    }
}
