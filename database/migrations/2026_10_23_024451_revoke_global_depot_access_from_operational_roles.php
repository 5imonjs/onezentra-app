<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $roleIds = DB::table('roles')
            ->whereIn('slug', ['staff_logistic', 'ga'])
            ->pluck('id');
        $permissionId = DB::table('permissions')
            ->where('slug', 'depot.view_all')
            ->value('id');

        if ($roleIds->isNotEmpty() && $permissionId !== null) {
            DB::table('role_permission')
                ->whereIn('role_id', $roleIds)
                ->where('permission_id', $permissionId)
                ->delete();
        }

        DB::table('permissions')
            ->where('slug', 'depot.view_region')
            ->update([
                'name' => 'Konteks Region (tanpa akses otomatis)',
                'description' => 'Menandai user sebagai pengguna berkonteks region; tidak memperluas cakupan data. Akses tetap hanya ke depo yang ditetapkan pada user.',
            ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::table('permissions')
            ->where('slug', 'depot.view_region')
            ->update([
                'name' => 'Akses Depo dalam Region',
                'description' => 'Cakupan regional: user hanya dapat mengakses depo yang ditetapkan pada user dan berada di region-nya. Tidak otomatis membuka semua depo anak dalam region.',
            ]);

        $roleIds = DB::table('roles')
            ->whereIn('slug', ['staff_logistic', 'ga'])
            ->pluck('id');
        $permissionId = DB::table('permissions')
            ->where('slug', 'depot.view_all')
            ->value('id');

        if ($roleIds->isEmpty() || $permissionId === null) {
            return;
        }

        $now = now();
        $rows = $roleIds->map(fn (int $roleId): array => [
            'role_id' => $roleId,
            'permission_id' => $permissionId,
            'created_at' => $now,
            'updated_at' => $now,
        ])->all();

        DB::table('role_permission')->insertOrIgnore($rows);
    }
};
