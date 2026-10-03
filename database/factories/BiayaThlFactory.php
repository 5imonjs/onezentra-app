<?php

namespace Database\Factories;

use App\Models\BiayaThl;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BiayaThl>
 *
 * `nominal_biaya` sengaja dijaga DI BAWAH ambang RFAH pada default state.
 * Ambang default 750.000; dokumen di atas ambang itu wajib melalui tahap
 * RFAH tambahan, jadi factory default dibuat murah agar test approval biasa
 * tidak ikut terseret ke jalur RFAH tanpa disadari.
 */
class BiayaThlFactory extends Factory
{
    protected $model = BiayaThl::class;

    public function definition(): array
    {
        return [
            'tanggal_pengajuan' => now()->toDateString(),
            'kode_depo' => 'DPO',
            'nama_depo' => 'Depo Test',
            'no_kendaraan' => strtoupper(fake()->bothify('?###??')),
            'type_kendaraan' => fake()->randomElement(['TRUCK', 'VAN', 'CONTAINER']),
            'no_surat_jalan' => strtoupper(fake()->bothify('SJ-####??')),
            'kubikasi_base' => fake()->randomFloat(2, 1, 30),
            // Di bawah config('biaya.thl_rfah_threshold') → is_rfah_required = false.
            'nominal_biaya' => fake()->numberBetween(50_000, 500_000),
            'is_rfah_required' => false,
            'status' => 'pending',
        ];
    }

    public function approved(): static
    {
        return $this->state(fn () => [
            'status' => 'approved',
            'submitted_at' => now()->subHours(3),
            'checked_by' => 1,
            'checked_at' => now()->subHours(2),
            'approved_by' => 1,
            'approved_at' => now()->subHour(),
        ]);
    }

    public function rejected(): static
    {
        return $this->state(fn () => [
            'status' => 'rejected',
            'rejected_by' => 1,
            'rejected_at' => now()->subHour(),
            'rejection_reason' => 'Nominal tidak sesuai evidence.',
        ]);
    }

    /** Nominal di atas ambang — dokumen ini wajib lewat tahap RFAH. */
    public function requiringRfah(): static
    {
        return $this->state(fn () => [
            'nominal_biaya' => fake()->numberBetween(800_000, 3_000_000),
            'is_rfah_required' => true,
            'rfah_name' => fake()->name(),
        ]);
    }
}
