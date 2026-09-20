<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Composite depot index untuk ForUserDepot scope (HasDepotScope.php:19)
        Schema::table('rencana_kirim', function (Blueprint $table): void {
            $table->index(['kode_depo', 'nama_depo'], 'idx_rk_depot');
            $table->index('created_at', 'idx_rk_created_at');
            $table->index('status', 'idx_rk_status');
            $table->index('po_transporter', 'idx_rk_po_transporter');
        });

        Schema::table('penerimaan', function (Blueprint $table): void {
            $table->index(['kode_depo', 'nama_depo'], 'idx_penerimaan_depot');
            $table->index('created_at', 'idx_penerimaan_created_at');
            $table->index('tanggal_penerimaan', 'idx_penerimaan_tanggal');
            $table->index('status', 'idx_penerimaan_status');
        });

        Schema::table('receiving_items', function (Blueprint $table): void {
            $table->index(['kode_depo', 'nama_depo'], 'idx_ri_depot');
            $table->index('tanggal_penerimaan', 'idx_ri_tanggal_penerimaan');
            $table->index('scan_time', 'idx_ri_scan_time');
            $table->index('created_at', 'idx_ri_created_at');
            $table->index('selisih_qty', 'idx_ri_selisih_qty');
        });

        Schema::table('receivings', function (Blueprint $table): void {
            $table->index('created_at', 'idx_receivings_created_at');
            $table->index('status', 'idx_receivings_status');
        });

        Schema::table('sj_validations', function (Blueprint $table): void {
            $table->index('created_at', 'idx_sjv_created_at');
            $table->index('rencana_kirim_id', 'idx_sjv_rk_id');
        });

        Schema::table('opname_expired_waves', function (Blueprint $table): void {
            $table->index('week_start', 'idx_oew_week_start');
            $table->index(['kode_depo', 'status_ini'], 'idx_oew_depot_status');
        });

        Schema::table('user_activity_logs', function (Blueprint $table): void {
            $table->index('occurred_at', 'idx_ual_occurred_at');
            $table->index(['user_id', 'occurred_at'], 'idx_ual_user_occurred');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('rencana_kirim', function (Blueprint $table): void {
            $table->dropIndex('idx_rk_depot');
            $table->dropIndex('idx_rk_created_at');
            $table->dropIndex('idx_rk_status');
            $table->dropIndex('idx_rk_po_transporter');
        });
        Schema::table('penerimaan', function (Blueprint $table): void {
            $table->dropIndex('idx_penerimaan_depot');
            $table->dropIndex('idx_penerimaan_created_at');
            $table->dropIndex('idx_penerimaan_tanggal');
            $table->dropIndex('idx_penerimaan_status');
        });
        Schema::table('receiving_items', function (Blueprint $table): void {
            $table->dropIndex('idx_ri_depot');
            $table->dropIndex('idx_ri_tanggal_penerimaan');
            $table->dropIndex('idx_ri_scan_time');
            $table->dropIndex('idx_ri_created_at');
            $table->dropIndex('idx_ri_selisih_qty');
        });
        Schema::table('receivings', function (Blueprint $table): void {
            $table->dropIndex('idx_receivings_created_at');
            $table->dropIndex('idx_receivings_status');
        });
        Schema::table('sj_validations', function (Blueprint $table): void {
            $table->dropIndex('idx_sjv_created_at');
            $table->dropIndex('idx_sjv_rk_id');
        });
        Schema::table('opname_expired_waves', function (Blueprint $table): void {
            $table->dropIndex('idx_oew_week_start');
            $table->dropIndex('idx_oew_depot_status');
        });
        Schema::table('user_activity_logs', function (Blueprint $table): void {
            $table->dropIndex('idx_ual_occurred_at');
            $table->dropIndex('idx_ual_user_occurred');
        });
    }
};
