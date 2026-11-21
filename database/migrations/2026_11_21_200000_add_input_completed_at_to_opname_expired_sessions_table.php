<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Penanda ringan "input selesai" dari petugas.
 *
 * Bukan status approval: sesi tetap IN_PROGRESS/REVISI dan koreksi wave baru
 * berlaku setelah approver independen memvalidasi di web. Kolom ini hanya
 * memberi sinyal kepada web bahwa seluruh baris sudah dihitung.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('opname_expired_sessions', function (Blueprint $table): void {
            if (! Schema::hasColumn('opname_expired_sessions', 'input_completed_at')) {
                $table->timestamp('input_completed_at')->nullable()->after('submitted_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('opname_expired_sessions', function (Blueprint $table): void {
            if (Schema::hasColumn('opname_expired_sessions', 'input_completed_at')) {
                $table->dropColumn('input_completed_at');
            }
        });
    }
};
