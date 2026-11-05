<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Pemisahan tugas (base praktik stock opname): petugas LAPANGAN hanya
     * menghitung fisik dan mengirim sesi; koreksi ke wave baru berlaku
     * setelah approver independen menyetujui. Kolom baru mencatat titik
     * kirim dan keputusan approval agar jejak audit satu sesi lengkap:
     * siapa menghitung, siapa menerima, siapa memutuskan.
     */
    public function up(): void
    {
        Schema::table('opname_expired_sessions', function (Blueprint $table) {
            $table->foreignId('submitted_by')->nullable()->after('created_by')->constrained('users');
            $table->timestamp('submitted_at')->nullable()->after('submitted_by');
            $table->foreignId('decided_by')->nullable()->after('submitted_at')->constrained('users');
            $table->timestamp('decided_at')->nullable()->after('decided_by');
            $table->text('decision_note')->nullable()->after('decided_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('opname_expired_sessions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('submitted_by');
            $table->dropConstrainedForeignId('decided_by');
            $table->dropColumn(['submitted_at', 'decided_at', 'decision_note']);
        });
    }
};
