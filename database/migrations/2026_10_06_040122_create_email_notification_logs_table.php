<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Jejak pengiriman notifikasi email: kegagalan/skip tidak boleh sunyi
     * (hanya log file) — admin harus bisa melihatnya dari UI Setting Email.
     */
    public function up(): void
    {
        Schema::create('email_notification_logs', function (Blueprint $table) {
            $table->id();
            $table->string('document_type', 50);
            $table->string('trigger', 50);
            $table->unsignedBigInteger('context_id')->nullable();
            $table->text('recipients')->nullable();
            $table->string('status', 20);
            $table->text('error')->nullable();
            $table->timestamps();

            $table->index(['document_type', 'trigger']);
            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('email_notification_logs');
    }
};
