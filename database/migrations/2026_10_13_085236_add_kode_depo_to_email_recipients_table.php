<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('email_recipients', function (Blueprint $table) {
            $table->string('kode_depo', 10)->nullable()->after('document_type');
            $table->index(['document_type', 'trigger', 'kode_depo']);
        });
    }

    public function down(): void
    {
        Schema::table('email_recipients', function (Blueprint $table) {
            $table->dropIndex(['document_type', 'trigger', 'kode_depo']);
            $table->dropColumn('kode_depo');
        });
    }
};
