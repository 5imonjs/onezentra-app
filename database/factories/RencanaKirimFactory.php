<?php

namespace Database\Factories;

use App\Models\RencanaKirim;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<RencanaKirim>
 *
 * Nomor PO dibuat unik lewat fake()->unique() supaya beberapa dokumen dalam
 * satu test tidak saling menabrakkan `po_transporter` — kolom itu dipakai
 * sebagai lookup utama saat warehouse memindai barcode.
 */
class RencanaKirimFactory extends Factory
{
    protected $model = RencanaKirim::class;

    public function definition(): array
    {
        return [
            'rkh_date' => now()->toDateString(),
            'po_transporter' => fake()->unique()->numerify('PO-########'),
            'driver_name' => fake()->name(),
            'nopol' => strtoupper(fake()->bothify('?###??')),
            'jenis_kendaraan' => fake()->randomElement(['TRUCK', 'VAN', 'CONTAINER']),
            'expedisi' => fake()->company(),
            'shipper_name' => fake()->company(),
            'shipper_address' => fake()->address(),
            'shipper_phone' => fake()->numerify('08##########'),
            'destination_name' => fake()->company(),
            'destination_address' => fake()->address(),
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'total_qty' => 0,
            'status' => 'DRAFT',
        ];
    }

    public function draft(): static
    {
        return $this->state(fn () => ['status' => 'DRAFT']);
    }

    public function scheduled(): static
    {
        return $this->state(fn () => ['status' => 'SCHEDULED', 'scheduled_at' => now()]);
    }

    public function checkedIn(): static
    {
        return $this->state(fn () => ['status' => 'CHECKED_IN', 'checked_in_at' => now()]);
    }

    public function completed(): static
    {
        return $this->state(fn () => [
            'status' => 'COMPLETED',
            'checked_in_at' => now()->subHour(),
            'verified_at' => now()->subMinutes(30),
            'completed_at' => now(),
        ]);
    }

    public function cancelled(): static
    {
        return $this->state(fn () => ['status' => 'CANCELLED']);
    }
}
