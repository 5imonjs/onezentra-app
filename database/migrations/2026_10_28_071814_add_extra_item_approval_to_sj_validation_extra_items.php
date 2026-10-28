<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Fase 2 alur barang luar rencana: keputusan planner.
     *
     * Catatan deviasi (Fase 1) kini punya status keputusan — planner
     * menyetujui atau menolak beserta catatannya. Rencana kirim tetap tidak
     * pernah diubah: kolom ini murni jejak keputusan (audit trail).
     */
    public function up(): void
    {
        Schema::table('sj_validation_extra_items', function (Blueprint $table) {
            $table->string('status', 20)->default('PENDING')->after('notes');
            $table->foreignId('approved_by')->nullable()->after('status')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->text('decision_notes')->nullable()->after('approved_at');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::table('sj_validation_extra_items', function (Blueprint $table) {
            $table->dropForeign(['approved_by']);
            $table->dropIndex(['status']);
            $table->dropColumn(['status', 'approved_by', 'approved_at', 'decision_notes']);
        });
    }
};
