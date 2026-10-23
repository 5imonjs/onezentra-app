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
        Schema::create('regions', function (Blueprint $table): void {
            $table->string('code', 20)->primary();
            $table->string('name', 100);
            $table->timestamps();
        });

        $regionCodes = DB::table('depot_settings')
            ->whereNotNull('region_id')
            ->where('region_id', '!=', '')
            ->distinct()
            ->pluck('region_id')
            ->merge(
                DB::table('users')
                    ->whereNotNull('region_id')
                    ->where('region_id', '!=', '')
                    ->distinct()
                    ->pluck('region_id')
            )
            ->unique();

        foreach ($regionCodes as $code) {
            DB::table('regions')->insert([
                'code' => $code,
                'name' => $code,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('regions');
    }
};
