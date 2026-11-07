<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receiving_items', function (Blueprint $table): void {
            $table->foreignId('baseline_import_id')
                ->nullable()
                ->after('source')
                ->constrained('opname_expired_baseline_imports')
                ->nullOnDelete();
            $table->index(['source', 'kode_depo', 'baseline_import_id'], 'receiving_items_legacy_baseline_index');
        });
    }

    public function down(): void
    {
        Schema::table('receiving_items', function (Blueprint $table): void {
            $table->dropIndex('receiving_items_legacy_baseline_index');
            $table->dropConstrainedForeignId('baseline_import_id');
        });
    }
};
