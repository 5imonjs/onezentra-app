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
        Schema::table('gate_transactions', function (Blueprint $table) {
            $table->renameColumn('no_dokumen', 'po_transporter');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('gate_transactions', function (Blueprint $table) {
            $table->renameColumn('po_transporter', 'no_dokumen');
        });
    }
};
