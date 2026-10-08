<?php

namespace Database\Factories;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'kode_depo' => fake()->unique()->bothify('DPO-####'),
            'nama_depo' => fake()->company(),
            'full_name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'password' => static::$password ??= Hash::make('password'),
            'level' => 'admin_master',
            'status' => 'active',
        ];
    }

    public function configure(): static
    {
        return $this->afterCreating(function (User $user): void {
            $role = Role::firstOrCreate(
                ['slug' => 'factory_role'],
                ['name' => 'Factory Role', 'is_active' => true]
            );
            $user->roles()->syncWithoutDetaching([$role->id]);
        });
    }
}
