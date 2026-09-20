<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('email_recipients', function (Blueprint $table) {
            $table->id();
            $table->string('document_type', 50); // rencana_kirim, sj_ba
            $table->string('trigger', 50);       // created, validated
            $table->string('recipient_type', 20)->default('email'); // email | user | role
            $table->string('field', 20)->default('TO'); // TO | CC
            $table->string('email')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('role_slug')->nullable();
            $table->string('label')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['document_type', 'trigger']);
            $table->index('field');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('email_recipients');
    }
};
