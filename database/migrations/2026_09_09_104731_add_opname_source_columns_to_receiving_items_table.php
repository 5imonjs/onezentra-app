<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receiving_items', function (Blueprint $table) {
            $table->unsignedBigInteger('receiving_id')->nullable()->change();
            $table->string('source', 20)->default('VALIDASI_SJ')->after('receiving_id');
            $table->string('sumber_material', 200)->nullable()->after('nama_barang');
            $table->string('kode_depo', 20)->nullable()->after('sumber_material');
            $table->string('nama_depo', 100)->nullable()->after('kode_depo');
            $table->decimal('qty_pcs', 12, 2)->nullable()->after('actual_qty');
            $table->decimal('conversion_factor', 12, 2)->nullable()->after('qty_pcs');
            $table->date('tanggal_penerimaan')->nullable()->after('expired_date');
            $table->index(['source', 'kode_depo'], 'receiving_items_source_depo_index');
        });
    }

    public function down(): void
    {
        Schema::table('receiving_items', function (Blueprint $table) {
            $table->dropIndex('receiving_items_source_depo_index');
            $table->dropColumn(['source', 'sumber_material', 'kode_depo', 'nama_depo', 'qty_pcs', 'conversion_factor', 'tanggal_penerimaan']);

            // SQLite tidak mendukung change di down; kembalikan konstrain NOT NULL manual.
            $table->unsignedBigInteger('receiving_id')->nullable(false)->change();
        });
    }
};
