<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Index untuk jalur baca yang sebelumnya memicu full-table scan:
 * dashboard (batches.status/created_at, npn.szStatus, standarisasi.status),
 * laporan penerimaan (receiving_items.photo — lewat receiving_items.kode_depo
 * sudah ada), dan resolusi file StorageController (kolom photo/file_path).
 */
return new class extends Migration
{
    /**
     * @var array<string, array{0: string, 1: array<int, string>, 2: string}>
     */
    private array $indexes = [
        ['batches', ['status', 'created_at'], 'batches_status_created_at_index'],
        ['npn', ['szStatus'], 'npn_sz_status_index'],
        ['standarisasi_tumpukan', ['status'], 'standarisasi_tumpukan_status_index'],
        ['receiving_items', ['photo'], 'receiving_items_photo_index'],
        ['sj_validation_items', ['photo'], 'sj_validation_items_photo_index'],
        ['opname_expired_session_items', ['photo'], 'opname_expired_session_items_photo_index'],
        ['biaya_thl_photos', ['file_path'], 'biaya_thl_photos_file_path_index'],
        ['biaya_retribusi_documents', ['file_path'], 'biaya_retribusi_documents_file_path_index'],
    ];

    public function up(): void
    {
        foreach ($this->indexes as [$table, $columns, $name]) {
            if (! Schema::hasIndex($table, $name)) {
                Schema::table($table, fn (Blueprint $blueprint) => $blueprint->index($columns, $name));
            }
        }
    }

    public function down(): void
    {
        foreach ($this->indexes as [$table, $columns, $name]) {
            if (Schema::hasIndex($table, $name)) {
                Schema::table($table, fn (Blueprint $blueprint) => $blueprint->dropIndex($name));
            }
        }
    }
};
