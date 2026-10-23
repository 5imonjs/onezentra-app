<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('level', 100)->default('admin_master')->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        $legacyRoleSlugs = [
            'admin_master',
            'staff_logistic',
            'rlh',
            'rfah',
            'rh',
            'blc',
            'bac',
            'admin_distirbusi',
            'admin_planner',
            'cheker',
            'sac',
            'operator',
            'ga',
            'bh',
        ];

        if (DB::table('users')->whereNotIn('level', $legacyRoleSlugs)->exists()) {
            throw new RuntimeException('Cannot restore the fixed user-level enum while users have custom role slugs.');
        }

        Schema::table('users', function (Blueprint $table) use ($legacyRoleSlugs): void {
            $table->enum('level', $legacyRoleSlugs)->default('admin_master')->change();
        });
    }
};
