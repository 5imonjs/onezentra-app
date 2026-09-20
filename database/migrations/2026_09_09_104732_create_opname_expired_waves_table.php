<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('opname_expired_waves', function (Blueprint $table) {
            $table->id();
            $table->date('week_start');
            $table->date('week_end');
            $table->string('kode_depo', 20)->nullable();
            $table->string('nama_depo', 100)->nullable();
            $table->string('kode_barang', 50);
            $table->string('nama_barang', 200)->nullable();
            $table->string('sumber_material', 200)->nullable();
            $table->date('expired_date_ini');
            $table->date('expired_date_lalu')->nullable();
            $table->integer('selisih_expired_date')->nullable();
            $table->integer('sisa_hari');
            $table->string('status_ini', 20)->default('AMAN');
            $table->string('status_lalu', 20)->nullable();
            $table->string('perubahan', 255)->nullable();
            $table->string('rekomendasi', 255)->nullable();
            $table->decimal('qty_ini_crt', 12, 2)->default(0);
            $table->decimal('qty_ini_pcs', 12, 2)->default(0);
            $table->decimal('qty_lalu_crt', 12, 2)->default(0);
            $table->decimal('qty_lalu_pcs', 12, 2)->default(0);
            $table->string('validasi_expired_date', 20)->nullable();
            $table->text('aksi_validasi')->nullable();
            $table->decimal('qty_koreksi_crt', 12, 2)->default(0);
            $table->decimal('qty_koreksi_pcs', 12, 2)->default(0);
            $table->string('koreksi_note', 255)->nullable();
            $table->bigInteger('koreksi_by')->nullable();
            $table->timestamp('koreksi_at')->nullable();
            $table->bigInteger('validated_by')->nullable();
            $table->timestamp('validated_at')->nullable();
            $table->index(['week_start', 'kode_depo'], 'opname_week_depo_index');
            $table->index(['status_ini'], 'opname_status_index');
            $table->index(['kode_barang'], 'opname_kode_barang_index');
            $table->unique(['week_start', 'kode_depo', 'kode_barang', 'expired_date_ini'], 'opname_batch_unique');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('opname_expired_waves');
    }
};
