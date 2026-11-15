<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Menghapus index yang duplikat/redundan.
 *
 * Setiap index di bawah ini memiliki pasangan yang mencakup kolom yang sama
 * (atau merupakan prefix dari index lain), sehingga tidak menambah manfaat
 * query tetapi menambah biaya tulis dan ukuran penyimpanan.
 */
return new class extends Migration
{
    /**
     * @var list<array{table: string, index: string, columns: list<string>, unique: bool}>
     */
    private array $duplicates = [
        ['table' => 'batches', 'index' => 'batches_batch_number_index', 'columns' => ['batch_number'], 'unique' => false],
        ['table' => 'users', 'index' => 'users_email_index', 'columns' => ['email'], 'unique' => false],
        ['table' => 'npn', 'index' => 'npn_bosnetszproductid_index', 'columns' => ['BOSnetszProductId'], 'unique' => false],
        ['table' => 'biaya_retribusi_details', 'index' => 'biaya_retribusi_details_receiving_id_index', 'columns' => ['receiving_id'], 'unique' => false],
        ['table' => 'receivings', 'index' => 'idx_receivings_status', 'columns' => ['status'], 'unique' => false],
        ['table' => 'rencana_kirim', 'index' => 'idx_rk_status', 'columns' => ['status'], 'unique' => false],
        ['table' => 'rencana_kirim', 'index' => 'idx_rk_po_transporter', 'columns' => ['po_transporter'], 'unique' => false],
        ['table' => 'rencana_kirim', 'index' => 'rencana_kirim_kode_depo_po_transporter_unique', 'columns' => ['kode_depo', 'po_transporter'], 'unique' => true],
        ['table' => 'role_user', 'index' => 'role_user_user_id_role_id_index', 'columns' => ['user_id', 'role_id'], 'unique' => false],
        ['table' => 'role_permission', 'index' => 'role_permission_role_id_permission_id_index', 'columns' => ['role_id', 'permission_id'], 'unique' => false],
        ['table' => 'sj_validations', 'index' => 'idx_sjv_rk_id', 'columns' => ['rencana_kirim_id'], 'unique' => false],
        ['table' => 'opname_expired_waves', 'index' => 'idx_oew_week_start', 'columns' => ['week_start'], 'unique' => false],
        ['table' => 'opname_expired_waves', 'index' => 'opname_week_depo_index', 'columns' => ['week_start', 'kode_depo'], 'unique' => false],
        ['table' => 'receiving_items', 'index' => 'receiving_items_source_depo_index', 'columns' => ['source', 'kode_depo'], 'unique' => false],
        ['table' => 'email_recipients', 'index' => 'email_recipients_document_type_trigger_index', 'columns' => ['document_type', 'trigger'], 'unique' => false],
        ['table' => 'user_activity_logs', 'index' => 'idx_ual_occurred_at', 'columns' => ['occurred_at'], 'unique' => false],
        ['table' => 'penerimaan', 'index' => 'cek_in_status_index', 'columns' => ['status'], 'unique' => false],
        ['table' => 'penerimaan', 'index' => 'cek_in_kode_depo_index', 'columns' => ['kode_depo'], 'unique' => false],
    ];

    public function up(): void
    {
        foreach ($this->duplicates as $duplicate) {
            if (! Schema::hasTable($duplicate['table'])) {
                continue;
            }

            if (! Schema::hasIndex($duplicate['table'], $duplicate['index'])) {
                continue;
            }

            Schema::table($duplicate['table'], function (Blueprint $table) use ($duplicate): void {
                $table->dropIndex($duplicate['index']);
            });
        }
    }

    public function down(): void
    {
        foreach ($this->duplicates as $duplicate) {
            if (! Schema::hasTable($duplicate['table'])) {
                continue;
            }

            if (Schema::hasIndex($duplicate['table'], $duplicate['index'])) {
                continue;
            }

            $isUnique = $duplicate['unique'];
            $columns = $duplicate['columns'];
            $index = $duplicate['index'];

            Schema::table($duplicate['table'], function (Blueprint $table) use ($isUnique, $columns, $index): void {
                if ($isUnique) {
                    $table->unique($columns, $index);

                    return;
                }

                $table->index($columns, $index);
            });
        }
    }
};
