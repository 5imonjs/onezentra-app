<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Null-kan referensi user/npn/item yang menggantung supaya penambahan
     * FK tidak gagal. Tidak menghapus baris mana pun.
     */
    private function nullifyOrphans(string $table, string $column, string $refTable, string $refColumn = 'id'): void
    {
        DB::table($table)
            ->whereNotNull("{$table}.{$column}")
            ->whereNotExists(function ($query) use ($table, $column, $refTable, $refColumn) {
                $query->select(DB::raw(1))
                    ->from($refTable)
                    ->whereColumn("{$refTable}.{$refColumn}", "{$table}.{$column}");
            })
            ->update([$column => null]);
    }

    public function up(): void
    {
        // Bersihkan referensi menggantung lebih dulu (aman: hanya SET NULL).
        $this->nullifyOrphans('npn', 'created_by', 'users');
        $this->nullifyOrphans('receivings', 'checked_by', 'users');
        $this->nullifyOrphans('gate_transactions', 'scanned_by', 'users');
        $this->nullifyOrphans('rencana_kirim', 'created_by', 'users');
        $this->nullifyOrphans('sj_validation_items', 'npn_id', 'npn');
        $this->nullifyOrphans('batches', 'sj_validation_item_id', 'sj_validation_items');
        $this->nullifyOrphans('standarisasi_tumpukan', 'requested_by', 'users');
        $this->nullifyOrphans('standarisasi_tumpukan', 'approved_by', 'users');
        $this->nullifyOrphans('cluster_principal', 'created_by', 'users');
        $this->nullifyOrphans('sessions', 'user_id', 'users');
        $this->nullifyOrphans('opname_expired_waves', 'koreksi_by', 'users');
        $this->nullifyOrphans('opname_expired_waves', 'validated_by', 'users');

        // npn.validated_by belum ada kolomnya -> tambah nullable + FK.
        Schema::table('npn', function (Blueprint $table) {
            $table->foreignId('validated_by')->nullable()->after('created_by')
                ->constrained('users')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('receivings', function (Blueprint $table) {
            $table->foreign('checked_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('gate_transactions', function (Blueprint $table) {
            $table->foreign('scanned_by')->references('id')->on('users')->nullOnDelete();
        });

        // shipments == rencana_kirim (nama tabel aktual).
        Schema::table('rencana_kirim', function (Blueprint $table) {
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('sj_validation_items', function (Blueprint $table) {
            $table->foreign('npn_id')->references('id')->on('npn')->nullOnDelete();
        });

        Schema::table('batches', function (Blueprint $table) {
            $table->foreign('sj_validation_item_id')->references('id')->on('sj_validation_items')->nullOnDelete();
        });

        Schema::table('standarisasi_tumpukan', function (Blueprint $table) {
            $table->foreign('requested_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('approved_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('cluster_principal', function (Blueprint $table) {
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        Schema::table('sessions', function (Blueprint $table) {
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });

        // waves == opname_expired_waves: koreksi_by/validated_by masih
        // bigint signed -> samakan ke unsignedBigInteger nullable + FK.
        Schema::table('opname_expired_waves', function (Blueprint $table) {
            $table->unsignedBigInteger('koreksi_by')->nullable()->change();
            $table->unsignedBigInteger('validated_by')->nullable()->change();
        });

        Schema::table('opname_expired_waves', function (Blueprint $table) {
            $table->foreign('koreksi_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('validated_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('opname_expired_waves', function (Blueprint $table) {
            $table->dropForeign(['koreksi_by']);
            $table->dropForeign(['validated_by']);
        });

        Schema::table('sessions', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });

        Schema::table('cluster_principal', function (Blueprint $table) {
            $table->dropForeign(['created_by']);
        });

        Schema::table('standarisasi_tumpukan', function (Blueprint $table) {
            $table->dropForeign(['requested_by']);
            $table->dropForeign(['approved_by']);
        });

        Schema::table('batches', function (Blueprint $table) {
            $table->dropForeign(['sj_validation_item_id']);
        });

        Schema::table('sj_validation_items', function (Blueprint $table) {
            $table->dropForeign(['npn_id']);
        });

        Schema::table('rencana_kirim', function (Blueprint $table) {
            $table->dropForeign(['created_by']);
        });

        Schema::table('gate_transactions', function (Blueprint $table) {
            $table->dropForeign(['scanned_by']);
        });

        Schema::table('receivings', function (Blueprint $table) {
            $table->dropForeign(['checked_by']);
        });

        Schema::table('npn', function (Blueprint $table) {
            $table->dropForeign(['created_by']);
            $table->dropForeign(['validated_by']);
            $table->dropColumn('validated_by');
        });
    }
};
