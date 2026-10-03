<?php

namespace Database\Factories;

use App\Models\ClusterPrincipal;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ClusterPrincipal>
 *
 * SKU dibuat unik karena kolom itu punya UNIQUE constraint di database —
 * tanpa itu, dua baris factory dalam satu test akan bentrok.
 */
class ClusterPrincipalFactory extends Factory
{
    protected $model = ClusterPrincipal::class;

    public function definition(): array
    {
        return [
            'lob' => fake()->randomElement(['DAIRY & DAIRY', 'Food', 'Beverage']),
            'product_category' => fake()->randomElement(['LIQUID MILK', 'Powder Milk', 'Bread/Soft Cake']),
            'sub_product_category' => fake()->randomElement(['STERILIZED', 'Gump 1+', 'CROISSANT']),
            'product_group' => fake()->randomElement(['Milk', 'Premium', 'CHOCOLATE']),
            'product_class' => fake()->randomElement(['FLAVORED MILK DRINK', 'Box', 'Can']),
            // SKU punya UNIQUE constraint. Pola lexify 'SKU-#####' hanya punya 100.000
            // kombinasi dan sering mengulang pada test yang membuat banyak baris,
            // jadi pakai penghitung yang ruangnya jauh lebih luas.
            'product_sku' => sprintf(
                'SKU-%06d',
                fake()->unique()->numberBetween(1, 999_999_999)
            ),
            'principal_1' => fake()->randomElement(['ABBOTT', 'NESTLE', 'BAUH', 'SJM']),
            // Principal kedua sengaja null pada sebagian besar baris supaya
            // default factory mencerminkan kasus paling umum di data asli.
            'principal_2' => null,
        ];
    }

    /** Baris dengan Principal 2 terisi (dipakai filter & tampilan kartu). */
    public function withSecondPrincipal(): static
    {
        return $this->state(fn () => [
            'principal_2' => fake()->randomElement(['ABBOTT-Pediasure', 'ABBOTT-Ensure', 'NESTLE-Kids']),
        ]);
    }
}
