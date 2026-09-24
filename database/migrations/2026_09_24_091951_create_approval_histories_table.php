<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('approval_histories', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type', 100);
            $table->unsignedBigInteger('subject_id');
            $table->string('from_status', 30)->nullable();
            $table->string('to_status', 30);
            $table->string('action', 30);
            $table->text('reason')->nullable();
            $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['subject_type', 'subject_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approval_histories');
    }
};
