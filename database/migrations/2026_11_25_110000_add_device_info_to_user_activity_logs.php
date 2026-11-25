<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Audit trail perlu menjawab "perangkat apa yang dipakai", bukan hanya
     * "user siapa". IP + User-Agent menangkap aksi web/curl, sedangkan
     * device_name menangkap perangkat mobile (nama token Sanctum).
     */
    public function up(): void
    {
        Schema::table('user_activity_logs', function (Blueprint $table): void {
            $table->string('ip_address', 45)->nullable()->after('route');
            $table->text('user_agent')->nullable()->after('ip_address');
            $table->string('device_name', 100)->nullable()->after('user_agent');
        });
    }

    public function down(): void
    {
        Schema::table('user_activity_logs', function (Blueprint $table): void {
            $table->dropColumn(['ip_address', 'user_agent', 'device_name']);
        });
    }
};
