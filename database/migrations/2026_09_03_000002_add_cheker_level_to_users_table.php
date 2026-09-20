<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('level', [
                'admin_master', 'staff_logistic', 'rlh', 'rfah', 'rh',
                'blc', 'bac', 'admin_distirbusi', 'admin_planner', 'cheker',
            ])->default('admin_master')->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->enum('level', [
                'admin_master', 'staff_logistic', 'rlh', 'rfah', 'rh',
                'blc', 'bac', 'admin_distirbusi', 'admin_planner', 'cheker',
            ])->default('admin_master')->change();
        });
    }
};
