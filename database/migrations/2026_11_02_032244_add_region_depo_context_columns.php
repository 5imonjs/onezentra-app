<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Kolom konteks Region/Depo yang dipakai isolasi data operasional.
     *
     * Produksi sudah memiliki kolom ini dari migrasi manual; guard
     * hasColumn membuat migrasi aman dijalankan ulang di sana.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'depo_id')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->integer('depo_id')->nullable()->after('region_id');
            });
        }

        if (! Schema::hasColumn('gate_transactions', 'region_id')) {
            Schema::table('gate_transactions', function (Blueprint $table): void {
                $table->integer('region_id')->nullable()->after('scan_time');
            });
        }

        if (! Schema::hasColumn('gate_transactions', 'depo_id')) {
            Schema::table('gate_transactions', function (Blueprint $table): void {
                $table->integer('depo_id')->nullable()->after('region_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('gate_transactions', 'depo_id')) {
            Schema::table('gate_transactions', function (Blueprint $table): void {
                $table->dropColumn('depo_id');
            });
        }

        if (Schema::hasColumn('gate_transactions', 'region_id')) {
            Schema::table('gate_transactions', function (Blueprint $table): void {
                $table->dropColumn('region_id');
            });
        }

        if (Schema::hasColumn('users', 'depo_id')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropColumn('depo_id');
            });
        }
    }
};
