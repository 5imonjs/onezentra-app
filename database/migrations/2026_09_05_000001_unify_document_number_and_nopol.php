<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // shipments: SJ/BA == PO Transporter, unifikasikan menjadi no_dokumen
        Schema::table('shipments', function (Blueprint $table) {
            $table->string('no_dokumen', 50)->nullable()->after('rkh_date');
        });

        DB::table('shipments')
            ->whereNull('no_dokumen')
            ->orderBy('id')
            ->get(['id', 'sj_number', 'po_transporter'])
            ->each(function ($row) {
                $value = $row->sj_number ?: $row->po_transporter;
                if ($value) {
                    DB::table('shipments')->where('id', $row->id)->update(['no_dokumen' => $value]);
                }
            });

        Schema::table('shipments', function (Blueprint $table) {
            $table->dropIndex(['sj_number']);
            $table->dropColumn(['sj_number', 'po_transporter']);
            $table->renameColumn('vehicle_plate', 'nopol');
            $table->index('no_dokumen');
        });

        // gate_transactions: sesuaikan penamaan dokumen & nopol
        Schema::table('gate_transactions', function (Blueprint $table) {
            $table->renameColumn('sj_number', 'no_dokumen');
            $table->renameColumn('plate_number', 'nopol');
        });
    }

    public function down(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->string('sj_number', 50)->nullable()->after('no_dokumen');
            $table->string('po_transporter', 100)->nullable()->after('sj_number');
        });

        DB::table('shipments')
            ->orderBy('id')
            ->get(['id', 'no_dokumen'])
            ->each(function ($row) {
                if ($row->no_dokumen) {
                    DB::table('shipments')->where('id', $row->id)->update([
                        'sj_number' => $row->no_dokumen,
                        'po_transporter' => $row->no_dokumen,
                    ]);
                }
            });

        Schema::table('shipments', function (Blueprint $table) {
            $table->dropIndex(['no_dokumen']);
            $table->dropColumn('no_dokumen');
            $table->renameColumn('nopol', 'vehicle_plate');
            $table->index('sj_number');
        });

        Schema::table('gate_transactions', function (Blueprint $table) {
            $table->renameColumn('no_dokumen', 'sj_number');
            $table->renameColumn('nopol', 'plate_number');
        });
    }
};
