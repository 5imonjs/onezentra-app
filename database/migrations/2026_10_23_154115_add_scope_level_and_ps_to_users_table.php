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
        Schema::table('users', function (Blueprint $table) {
            $table->string('scope_level', 20)->default('depot')->after('level')->index();
            $table->string('kode_ps', 20)->nullable()->after('kode_depo')->index();
        });

        DB::table('users')->where('level', 'admin_master')->update(['scope_level' => 'master']);
        DB::table('users')->whereNull('region_id')->whereNotNull('kode_depo')
            ->orderBy('id')
            ->chunkById(100, function ($users): void {
                foreach ($users as $user) {
                    $regionId = DB::table('depot_settings')
                        ->where('kode_depo', $user->kode_depo)
                        ->value('region_id');

                    if ($regionId) {
                        DB::table('users')->where('id', $user->id)->update(['region_id' => $regionId]);
                    }
                }
            });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['scope_level']);
            $table->dropIndex(['kode_ps']);
            $table->dropColumn(['scope_level', 'kode_ps']);
        });
    }
};
