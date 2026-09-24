<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('approval_assignments', function (Blueprint $table) {
            $table->string('module', 20)->default('biaya_thl')->after('id');
        });

        // Baris lama milik pola THL (satu-satunya pola sebelum kolom module ada).
        DB::table('approval_assignments')->whereNull('module')->orWhere('module', '')->update(['module' => 'biaya_thl']);

        Schema::table('approval_assignments', function (Blueprint $table) {
            $table->dropUnique(['kode_depo', 'approval_level']);
            $table->unique(['module', 'kode_depo', 'approval_level'], 'approval_assignments_module_depo_level_unique');
        });
    }

    public function down(): void
    {
        Schema::table('approval_assignments', function (Blueprint $table) {
            $table->dropUnique('approval_assignments_module_depo_level_unique');
            $table->unique(['kode_depo', 'approval_level']);
            $table->dropColumn('module');
        });
    }
};
