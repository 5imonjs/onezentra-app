<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('kode_depo', 20);
            $table->string('nama_depo', 100);
            $table->string('full_name', 100)->nullable();
            $table->string('email', 50)->index();
            $table->string('password', 255);
            $table->text('two_factor_secret')->nullable();
            $table->text('two_factor_recovery_codes')->nullable();
            $table->timestamp('two_factor_confirmed_at')->nullable();
            $table->enum('level', ['admin_master', 'staff_logistic', 'rlh', 'rfah', 'rh', 'blc', 'bac', 'admin_distirbusi', 'admin_planner'])->default('admin_master');
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
