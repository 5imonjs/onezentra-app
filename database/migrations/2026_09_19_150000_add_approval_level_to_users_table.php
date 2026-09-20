<?php

use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        // Level enum sudah mendukung 10 role lama di migration awal.
        // Kolom approval_level tidak diperlukan lagi.
    }

    public function down(): void
    {
        // Tidak perlu rollback — level enum tetap 10 value.
    }
};
