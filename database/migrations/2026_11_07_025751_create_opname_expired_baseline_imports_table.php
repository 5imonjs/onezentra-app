<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Manifes baseline awal (Excel legacy). Baris baseline tetap disimpan di
     * `receiving_items` (satu-satunya ledger), dengan `source = LEGACY_IMPORT`
     * dan `baseline_import_id` menunjuk ke manifes ini. Tabel ini menjaga
     * bukti satu-kali-import + batas waktu (cutoff) agar Receiving yang sudah
     * tercakup baseline tidak dihitung dua kali.
     */
    public function up(): void
    {
        Schema::create('opname_expired_baseline_imports', function (Blueprint $table): void {
            $table->id();
            $table->string('kode_depo', 20)->nullable();
            $table->string('nama_depo', 100)->nullable();
            $table->string('file_name', 255)->nullable();
            $table->string('file_checksum', 64)->nullable();
            $table->unsignedInteger('row_count')->default(0);
            $table->decimal('total_qty_crt', 14, 2)->default(0);
            $table->decimal('total_qty_pcs', 14, 2)->default(0);
            $table->foreignId('imported_by')->constrained('users');
            $table->timestamp('imported_at');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('kode_depo');
            $table->index('imported_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('opname_expired_baseline_imports');
    }
};
