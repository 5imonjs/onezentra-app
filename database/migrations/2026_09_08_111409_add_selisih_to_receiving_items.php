<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('receiving_items', function (Blueprint $table) {
            $table->decimal('selisih_qty', 12, 2)->nullable()->after('actual_qty');
            $table->string('selisih_reason', 200)->nullable()->after('selisih_qty');
            $table->foreignId('validated_by')->nullable()->after('selisih_reason')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('receiving_items', function (Blueprint $table) {
            $table->dropForeign(['validated_by']);
            $table->dropColumn(['selisih_qty', 'selisih_reason', 'validated_by']);
        });
    }
};
