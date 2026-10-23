<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $userIds = DB::table('users')
            ->where('level', 'admin_master')
            ->pluck('id')
            ->all();

        $roleId = DB::table('roles')->where('slug', 'admin_master')->value('id');
        if ($roleId === null && $userIds === []) {
            return;
        }

        DB::table('permissions')->updateOrInsert(
            ['slug' => 'opname.delete_validated'],
            [
                'name' => 'Hapus Wave Opname Tervalidasi',
                'menu_group' => 'Opname',
                'icon' => 'shield-check',
                'route' => null,
                'sort_order' => 476,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );

        if ($roleId === null) {
            $roleId = DB::table('roles')->insertGetId([
                'name' => 'Admin Master',
                'slug' => 'admin_master',
                'description' => 'Akses sesuai permission yang diberikan',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            DB::table('roles')->where('id', $roleId)->update([
                'is_active' => true,
                'updated_at' => now(),
            ]);
        }

        $affectedUserIds = DB::table('role_user')
            ->where('role_id', $roleId)
            ->pluck('user_id')
            ->map(fn (int $userId): int => $userId)
            ->all();

        $timestamp = now();
        $permissions = DB::table('permissions')
            ->where('is_active', true)
            ->pluck('id')
            ->map(fn (int $permissionId): array => [
                'role_id' => $roleId,
                'permission_id' => $permissionId,
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ])
            ->all();

        foreach (array_chunk($permissions, 500) as $permissionBatch) {
            DB::table('role_permission')->insertOrIgnore($permissionBatch);
        }

        $roleUsers = array_map(fn (int $userId): array => [
            'user_id' => $userId,
            'role_id' => $roleId,
            'created_at' => $timestamp,
            'updated_at' => $timestamp,
        ], $userIds);

        foreach (array_chunk($roleUsers, 500) as $userBatch) {
            DB::table('role_user')->insertOrIgnore($userBatch);
        }

        foreach (array_unique(array_merge($affectedUserIds, $userIds)) as $userId) {
            Cache::forget("user:{$userId}:permissions");
        }
    }

    public function down(): void
    {
        // Keep migrated grants: they preserve access explicitly and may have
        // since been reviewed or adjusted by an administrator.
    }
};
