<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('docks', function (Blueprint $table) {
            $table->unsignedInteger('capacity')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('docks', function (Blueprint $table) {
            $table->string('capacity', 50)->nullable()->change();
        });
    }
};
