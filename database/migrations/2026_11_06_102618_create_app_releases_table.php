<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Katalog rilis aplikasi mobile. Satu baris = satu APK/IPA yang
     * dipublikasikan — app membandingkan build number terinstal dengan
     * rilis tertinggi pada platformnya untuk menawarkan/memaksa update.
     */
    public function up(): void
    {
        Schema::create('app_releases', function (Blueprint $table) {
            $table->id();
            $table->string('platform', 20)->default('android');
            $table->string('version_name', 40);
            $table->unsignedInteger('version_code');
            // Build number terendah yang tetap boleh berjalan — di bawah
            // angka ini app menampilkan layar update wajib.
            $table->unsignedInteger('min_supported_code')->default(0);
            $table->string('apk_url', 2048);
            $table->string('sha256', 64)->nullable();
            $table->text('notes')->nullable();
            // Paksa update walau min_supported tidak tercapai — mis.
            // perbaikan darurat yang harus diinstal semua user.
            $table->boolean('force')->default(false);
            $table->timestamp('published_at')->useCurrent();
            $table->timestamps();

            $table->index(['platform', 'version_code']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('app_releases');
    }
};
