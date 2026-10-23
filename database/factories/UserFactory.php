<?php

namespace Database\Factories;

use App\Models\Permission;
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
            'scope_level' => 'depot',
            'level' => 'staff_logistic',
            'status' => 'active',
        ];
    }

    /**
     * User admin dengan permission yang diberikan eksplisit untuk fixture.
     */
    public function adminMaster(): static
    {
        return $this->state(fn (array $attributes): array => [
            'level' => 'admin_master',
            'scope_level' => 'master',
        ])->afterCreating(function (User $user): void {
            $role = Role::firstOrCreate(
                ['slug' => 'admin_master'],
                ['name' => 'Admin Master', 'is_active' => true],
            );
            $role->permissions()->syncWithoutDetaching(Permission::where('is_active', true)->pluck('id'));
            $user->roles()->syncWithoutDetaching([$role->id]);
        });
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
