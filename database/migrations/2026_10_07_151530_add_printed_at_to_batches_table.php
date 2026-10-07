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
        Schema::table('batches', function (Blueprint $table) {
            // Jejak label fisik benar-benar dicetak (bukan sekadar tombol PDF
            // dibuka). Sumber kebenaran badge "Label tercetak" di validasi-sj
            // dan halaman Inbound — localStorage per-browser digantikan kolom
            // ini agar akurat lintas device dan lintas halaman.
            $table->timestamp('printed_at')->nullable()->after('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('batches', function (Blueprint $table) {
            $table->dropColumn('printed_at');
        });
    }
};
