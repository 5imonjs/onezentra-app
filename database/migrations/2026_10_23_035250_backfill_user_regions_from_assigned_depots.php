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
        DB::table('users')
            ->where(function ($query): void {
                $query->whereNull('region_id')->orWhere('region_id', '');
            })
            ->orderBy('id')
            ->chunkById(200, function ($users): void {
                foreach ($users as $user) {
                    $depotCodes = DB::table('user_depots')
                        ->where('user_id', $user->id)
                        ->pluck('kode_depo')
                        ->all();

                    if ($depotCodes === [] && ! blank($user->kode_depo)) {
                        $depotCodes = [$user->kode_depo];
                    }

                    if ($depotCodes === []) {
                        continue;
                    }

                    $depots = DB::table('depot_settings')
                        ->whereIn('kode_depo', $depotCodes)
                        ->whereNotNull('region_id')
                        ->where('region_id', '!=', '')
                        ->get(['kode_depo', 'region_id']);

                    if ($depots->count() !== count($depotCodes)) {
                        continue;
                    }

                    $regions = $depots->pluck('region_id')->unique();
                    if ($regions->count() !== 1) {
                        continue;
                    }

                    DB::table('users')
                        ->where('id', $user->id)
                        ->where(function ($query): void {
                            $query->whereNull('region_id')->orWhere('region_id', '');
                        })
                        ->update(['region_id' => $regions->first()]);
                }
            });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Keep inferred regions: a user may have been edited after this backfill.
    }
};
