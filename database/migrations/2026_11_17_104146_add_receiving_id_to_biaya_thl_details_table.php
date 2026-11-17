<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Menyimpan asal penerimaan untuk tiap pekerja THL.
 *
 * Sebelumnya THL murni input manual, sehingga qty/SJ/kubikasi bisa berbeda
 * dengan penerimaan aktual setelah Validasi SJ dikoreksi. Dengan receiving_id,
 * server bisa menurunkan data tersebut dari ledger.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('biaya_thl_details', function (Blueprint $table): void {
            $table->foreignId('receiving_id')
                ->nullable()
                ->after('biaya_thl_id')
                ->constrained('receivings')
                ->nullOnDelete();

            $table->index('receiving_id');
        });
    }

    public function down(): void
    {
        Schema::table('biaya_thl_details', function (Blueprint $table): void {
            $table->dropForeign(['receiving_id']);
            $table->dropIndex(['receiving_id']);
            $table->dropColumn('receiving_id');
        });
    }
};
