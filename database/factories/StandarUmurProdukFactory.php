<?php

namespace Database\Factories;

use App\Models\StandarUmurProduk;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StandarUmurProduk>
 *
 * Kolom DOA (min_doi/target_doi/max_doi) sengaja diberi nilai terurut
 * min <= target <= max. Factory yang menghasilkan nilai acak bisa membuat
 * baris yang secara bisnis tidak masuk akal.
 */
class StandarUmurProdukFactory extends Factory
{
    protected $model = StandarUmurProduk::class;

    public function definition(): array
    {
        $min = fake()->numberBetween(30, 90);
        $target = $min + fake()->numberBetween(10, 30);
        $max = $target + fake()->numberBetween(10, 60);

        return [
            'material' => fake()->unique()->numerify('##########'),
            'material_description' => fake()->words(3, true),
            'ext_material_group' => fake()->randomElement(['Dairy', 'Food', 'Beverage']),
            'country' => fake()->randomElement(['ID', 'MY', 'NL', 'CH']),
            'principal' => fake()->randomElement(['ABBOTT', 'NESTLE', 'BAUH']),
            'cluster' => fake()->randomElement(['Dairy & Dairy', 'Food']),
            'cluster2' => fake()->randomElement(['Liquid Milk', 'Powder Milk']),
            'lob' => fake()->randomElement(['Dairy & Dairy', 'Food', 'Beverage']),
            'category' => fake()->randomElement(['LIQUID MILK', 'Powder Milk']),
            'sub_category' => fake()->randomElement(['STERILIZED', 'Gump 1+']),
            'brand' => fake()->randomElement(['Grow', 'Pediasure', 'Ensure']),
            'min_doi' => $min,
            'target_doi' => $target,
            'max_doi' => $max,
            'umur' => $target,
            'uom' => 'PCS',
            'sku_status' => fake()->randomElement(['A', 'DEL', 'EXISTING']),
        ];
    }

    /** Nilai DOI tak berurut — untuk menguji validasi konsistensi. */
    public function inconsistentDoi(): static
    {
        return $this->state(fn () => [
            'min_doi' => 100,
            'target_doi' => 10,
            'max_doi' => 50,
        ]);
    }
}
