<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('permissions')
            ->whereIn('slug', ['depot.view_all', 'depot.view_region'])
            ->update(['parent_id' => null]);
    }

    public function down(): void
    {
        $globalPermissionId = DB::table('permissions')
            ->where('slug', 'depot.view_all')
            ->value('id');

        if ($globalPermissionId !== null) {
            DB::table('permissions')
                ->where('slug', 'depot.view_region')
                ->update(['parent_id' => $globalPermissionId]);
        }
    }
};
