<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('opname_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 50)->unique();
            $table->integer('value')->nullable();
            $table->timestamps();
        });

        DB::table('opname_settings')->insert([
            ['key' => 'threshold_aman', 'value' => 90],
            ['key' => 'threshold_perhatian', 'value' => 30],
            ['key' => 'threshold_kritis', 'value' => 7],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('opname_settings');
    }
};
