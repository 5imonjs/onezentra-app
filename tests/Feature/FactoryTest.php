<?php

namespace Tests\Feature;

use App\Models\BiayaThl;
use App\Models\ClusterPrincipal;
use App\Models\Npn;
use App\Models\RencanaKirim;
use App\Models\StandarUmurProduk;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Menguji factory-nya sendiri.
 *
 * Factory yang tidak pernah dieksekusi akan cepat usang diam-diam: kolom di
 * migration berubah, factory tidak ikut, test yang memakainya mulai gagal jauh
 * dari sumber masalahnya. Test ini membuat factory tetap hidup.
 */
class FactoryTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Test terpisah per model, bukan lewat dataProvider: PHPUnit 11+
     * menyingkirkan anotasi @dataProvider demi favour attributes eksplisit
     * (#[DataProvider]) yang memang lebih eksplisit soal dependensi.
     */
    public function test_npn_factory_creates_valid_row(): void
    {
        $this->assertFactoryCreates(Npn::class);
    }

    public function test_rencana_kirim_factory_creates_valid_row(): void
    {
        $this->assertFactoryCreates(RencanaKirim::class);
    }

    public function test_cluster_principal_factory_creates_valid_row(): void
    {
        $this->assertFactoryCreates(ClusterPrincipal::class);
    }

    public function test_standar_umur_produk_factory_creates_valid_row(): void
    {
        $this->assertFactoryCreates(StandarUmurProduk::class);
    }

    public function test_biaya_thl_factory_creates_valid_row(): void
    {
        $this->assertFactoryCreates(BiayaThl::class);
    }

    public function test_npn_factory_creates_many_without_unique_conflict(): void
    {
        $this->assertFactoryCreatesMany(Npn::class);
    }

    public function test_rencana_kirim_factory_creates_many_without_unique_conflict(): void
    {
        $this->assertFactoryCreatesMany(RencanaKirim::class);
    }

    public function test_cluster_principal_factory_creates_many_without_unique_conflict(): void
    {
        $this->assertFactoryCreatesMany(ClusterPrincipal::class);
    }

    public function test_standar_umur_produk_factory_creates_many_without_unique_conflict(): void
    {
        $this->assertFactoryCreatesMany(StandarUmurProduk::class);
    }

    public function test_biaya_thl_factory_creates_many_without_unique_conflict(): void
    {
        $this->assertFactoryCreatesMany(BiayaThl::class);
    }

    private function assertFactoryCreates(string $modelClass): void
    {
        $row = $modelClass::factory()->create();

        $this->assertNotNull($row->id, "{$modelClass} factory tidak menghasilkan id");
        // getTable() dipanggil pada instance — method itu non-static.
        $this->assertDatabaseHas($row->getTable(), ['id' => $row->id]);
    }

    /**
     * Menangkap constraint unik yang belum diperhitungkan factory — penyebab
     * paling umum test jadi flaky setelah factory ditambahkan.
     */
    private function assertFactoryCreatesMany(string $modelClass): void
    {
        $rows = $modelClass::factory()->count(5)->create();

        $this->assertCount(5, $rows);
        $this->assertSame(
            5,
            $rows->pluck('id')->unique()->count(),
            "{$modelClass} factory menghasilkan id duplikat"
        );
    }

    /** Nilai DOI harus tetap masuk akal: min <= target <= max. */
    public function test_standar_umur_factory_keeps_doi_ordered(): void
    {
        $row = StandarUmurProduk::factory()->create();

        $this->assertLessThanOrEqual($row->target_doi, $row->min_doi);
        $this->assertLessThanOrEqual($row->max_doi, $row->target_doi);
    }

    /** Default factory tidak boleh otomatis memicu tahap RFAH. */
    public function test_biaya_thl_default_is_below_rfah_threshold(): void
    {
        $threshold = (int) config('biaya.thl_rfah_threshold', 750000);
        $row = BiayaThl::factory()->create();

        $this->assertLessThan($threshold, $row->nominal_biaya);
        $this->assertFalse((bool) $row->is_rfah_required);

        $rfah = BiayaThl::factory()->requiringRfah()->create();
        $this->assertGreaterThan($threshold, $rfah->nominal_biaya);
        $this->assertTrue((bool) $rfah->is_rfah_required);
    }

    public function test_cluster_principal_states(): void
    {
        $default = ClusterPrincipal::factory()->create();
        $this->assertNull($default->principal_2, 'default sebaiknya tanpa Principal 2');

        $withSecond = ClusterPrincipal::factory()->withSecondPrincipal()->create();
        $this->assertNotNull($withSecond->principal_2);
    }

    public function test_npn_states(): void
    {
        $this->assertSame('DEL', Npn::factory()->deleted()->create()->szStatus);
        $this->assertSame('EXISTING', Npn::factory()->existing()->create()->szStatus);
        $this->assertNull(Npn::factory()->withoutBarcode()->create()->szBarcode);
    }

    public function test_rencana_kirim_states_cover_all_statuses(): void
    {
        $statuses = [
            RencanaKirim::factory()->draft()->create()->status,
            RencanaKirim::factory()->scheduled()->create()->status,
            RencanaKirim::factory()->checkedIn()->create()->status,
            RencanaKirim::factory()->completed()->create()->status,
            RencanaKirim::factory()->cancelled()->create()->status,
        ];

        $this->assertSame(
            ['DRAFT', 'SCHEDULED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED'],
            $statuses
        );
    }
}
