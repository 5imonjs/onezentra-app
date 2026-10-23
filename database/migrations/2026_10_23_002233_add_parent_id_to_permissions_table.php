<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Hierarki tampilan permission (bukan hierarki hak akses): permission
     * turunan dirender sebagai cabang di bawah induknya pada layar
     * Roles & Permissions. Contoh: `depot.view_region` adalah cabang dari
     * `depot.view_all`.
     */
    public function up(): void
    {
        Schema::table('permissions', function (Blueprint $table) {
            $table->foreignId('parent_id')
                ->nullable()
                ->after('id')
                ->constrained('permissions')
                ->nullOnDelete();
        });

        // Data awal: region adalah cabang dari akses semua depo.
        $parentId = DB::table('permissions')->where('slug', 'depot.view_all')->value('id');
        if ($parentId !== null) {
            DB::table('permissions')
                ->where('slug', 'depot.view_region')
                ->update(['parent_id' => $parentId]);
        }
    }

    public function down(): void
    {
        Schema::table('permissions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_id');
        });
    }
};
