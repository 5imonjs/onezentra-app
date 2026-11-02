<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $permissionId = DB::table('permissions')
            ->where('slug', 'standarisasi.create')
            ->value('id');
        $roleIds = DB::table('roles')
            ->whereIn('slug', ['cheker', 'operator'])
            ->pluck('id');

        if (! $permissionId || $roleIds->isEmpty()) {
            return;
        }

        foreach ($roleIds as $roleId) {
            DB::table('role_permission')->updateOrInsert(
                ['role_id' => $roleId, 'permission_id' => $permissionId],
                ['created_at' => now(), 'updated_at' => now()],
            );
        }

        DB::table('role_user')
            ->whereIn('role_id', $roleIds)
            ->distinct()
            ->pluck('user_id')
            ->each(fn (int $userId) => Cache::forget("user:{$userId}:permissions"));
    }

    public function down(): void
    {
        // Keep the field-role grant forward-only so deployments do not revoke
        // access that an administrator may have intentionally retained.
    }
};
