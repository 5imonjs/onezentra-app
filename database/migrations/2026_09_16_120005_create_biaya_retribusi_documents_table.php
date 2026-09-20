<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('biaya_retribusi_documents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('biaya_retribusi_id');
            $table->string('document_type', 50)->nullable();
            $table->string('file_path', 255);
            $table->string('file_name', 255);
            $table->string('mime_type', 100)->nullable();
            $table->integer('file_size')->default(0);
            $table->integer('order')->default(0);
            $table->timestamps();

            $table->foreign('biaya_retribusi_id')->references('id')->on('biaya_retribusis')->onDelete('cascade');
            $table->index('biaya_retribusi_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('biaya_retribusi_documents');
    }
};
