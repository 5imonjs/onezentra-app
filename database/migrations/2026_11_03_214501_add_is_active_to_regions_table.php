<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Kolom is_active pada regions dipakai RegionDepoValidationController
     * (dan test RegionDepoValidationTest) untuk menolak region yang
     * dinonaktifkan. Produksi memiliki kolom ini dari migrasi manual;
     * guard hasColumn membuat migrasi aman dijalankan ulang di sana.
     * Tanpa kolom ini di lingkungan fresh, SQLite menganggap
     * "is_active" sebagai string literal sehingga validasi region
     * selalu gagal dan login SPA tidak pernah berhasil.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('regions', 'is_active')) {
            Schema::table('regions', function (Blueprint $table): void {
                $table->boolean('is_active')->default(true)->after('name');
            });

            DB::table('regions')->update(['is_active' => true]);
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('regions', 'is_active')) {
            Schema::table('regions', function (Blueprint $table): void {
                $table->dropColumn('is_active');
            });
        }
    }
};
