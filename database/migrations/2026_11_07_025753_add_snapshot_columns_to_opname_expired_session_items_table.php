<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Snapshot qty sistem saat sesi dimulai. Tanpa kolom ini, qty pembanding
     * dibaca live dari ledger sehingga Receiving yang masuk di tengah sesi
     * mengubah selisih opname yang sudah/akan dihitung.
     */
    public function up(): void
    {
        Schema::table('opname_expired_session_items', function (Blueprint $table): void {
            $table->decimal('qty_sistem_crt', 12, 2)->nullable()->after('qty_fisik_pcs');
            $table->decimal('qty_sistem_pcs', 12, 2)->nullable()->after('qty_sistem_crt');
        });
    }

    public function down(): void
    {
        Schema::table('opname_expired_session_items', function (Blueprint $table): void {
            $table->dropColumn(['qty_sistem_crt', 'qty_sistem_pcs']);
        });
    }
};
