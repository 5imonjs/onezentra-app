<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * NPN provisi: baris master produk yang dibuat manual (web) untuk barang
     * yang DITERIMA tapi belum terdaftar di master BOS/SAP. Tetap dipakai
     * penuh oleh penerimaan & opname expired — bendera `is_provisional`
     * hanya menandai bahwa identitasnya belum diverifikasi.
     */
    public function up(): void
    {
        Schema::table('npn', function (Blueprint $table) {
            $table->boolean('is_provisional')->default(false)->after('szStatus')->index();
            $table->string('provisional_note', 255)->nullable()->after('is_provisional');
        });
    }

    public function down(): void
    {
        Schema::table('npn', function (Blueprint $table) {
            $table->dropIndex(['is_provisional']);
            $table->dropColumn(['is_provisional', 'provisional_note']);
        });
    }
};
