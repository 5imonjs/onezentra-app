<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::rename('cek_in', 'penerimaan');
    }

    public function down(): void
    {
        Schema::rename('penerimaan', 'cek_in');
    }
};
