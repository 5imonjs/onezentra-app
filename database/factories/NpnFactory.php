<?php

namespace Database\Factories;

use App\Models\Npn;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Npn>
 *
 * Npn punya 50+ kolom karena meng-import master produk dari sistem BOS/SAP.
 * Hanya kolom yang dipakai test/UI yang diisi di sini — sisanya dibiarkan
 * null, karena memaksa semua kolom terisi hanya menambah data palsu.
 */
class NpnFactory extends Factory
{
    protected $model = Npn::class;

    public function definition(): array
    {
        $bosId = fake()->unique()->numerify('BOS#####');
        $sapId = fake()->unique()->numerify('SAP#####');

        return [
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'BOSnetszProductId' => $bosId,
            'SAPszProductId' => $sapId,
            'szNickName' => fake()->unique()->lexify('???-#####'),
            'szNickNameNew' => fake()->words(3, true),
            'szShortDescription' => fake()->sentence(4),
            'szBarcode' => fake()->unique()->numerify('899########'),
            'szStatus' => 'A',
            'szCompUomDesc' => 'PCS',
            'SAPszSalesOrgId' => fake()->randomElement(['1000', '2000', '3000']),
        ];
    }

    /** Produk aktif — status default yang dipakai mayoritas test. */
    public function active(): static
    {
        return $this->state(fn () => ['szStatus' => 'A']);
    }

    /** Produk soft-deleted. */
    public function deleted(): static
    {
        return $this->state(fn () => ['szStatus' => 'DEL']);
    }

    /** Produk yang sudah ada di master lama (bukan hasil import baru). */
    public function existing(): static
    {
        return $this->state(fn () => ['szStatus' => 'EXISTING']);
    }

    /** Belum punya barcode — dipakai test yang memeriksa kelengkapan isian. */
    public function withoutBarcode(): static
    {
        return $this->state(fn () => ['szBarcode' => null]);
    }
}
