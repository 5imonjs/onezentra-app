<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('lmp');
    }

    public function down(): void
    {
        // Tidak diimplementasikan - LMP dihapus dari sistem
    }
};
