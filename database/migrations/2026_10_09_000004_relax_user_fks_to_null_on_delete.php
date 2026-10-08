<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Hapus user tidak boleh menggagalkan hapus atau menghapus data
     * operasional: rujukan aktor dinullkan, baris tetap ada.
     * Kolom-kolom di bawah sudah nullable; migrasi ini hanya menukar FK
     * restrict menjadi nullOnDelete. Orphan dinullkan dulu supaya
     * penambahan FK tidak gagal. Tidak menghapus baris mana pun.
     */
    public function up(): void
    {
        foreach ([
            ['opname_expired_sessions', 'assigned_to', 'users'],
            ['opname_expired_sessions', 'created_by', 'users'],
            ['opname_expired_session_items', 'verified_by', 'users'],
            ['users', 'updated_by', 'users'],
            ['batches', 'receiving_item_id', 'receiving_items'],
        ] as [$table, $column, $refTable]) {
            DB::table($table)
                ->whereNotNull("{$table}.{$column}")
                ->whereNotExists(function ($query) use ($table, $column, $refTable) {
                    $query->select(DB::raw(1))
                        ->from($refTable)
                        ->whereColumn("{$refTable}.id", "{$table}.{$column}");
                })
                ->update([$column => null]);
        }

        $this->dropForeignIfExists('opname_expired_sessions', ['assigned_to', 'created_by']);
        Schema::table('opname_expired_sessions', function (Blueprint $table) {
            // Di database aktual kedua kolom masih NOT NULL (asumsi
            // "sudah nullable" keliru) — SET NULL butuh nullable dulu.
            $table->unsignedBigInteger('assigned_to')->nullable()->change();
            $table->unsignedBigInteger('created_by')->nullable()->change();
        });
        Schema::table('opname_expired_sessions', function (Blueprint $table) {
            $table->foreign('assigned_to')->references('id')->on('users')->nullOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
        });

        $this->dropForeignIfExists('opname_expired_session_items', ['verified_by']);
        Schema::table('opname_expired_session_items', function (Blueprint $table) {
            $table->foreign('verified_by')->references('id')->on('users')->nullOnDelete();
        });

        $this->dropForeignIfExists('users', ['updated_by']);
        Schema::table('users', function (Blueprint $table) {
            $table->foreign('updated_by')->references('id')->on('users')->nullOnDelete();
        });

        $this->dropForeignIfExists('batches', ['receiving_item_id']);
        Schema::table('batches', function (Blueprint $table) {
            $table->foreign('receiving_item_id')->references('id')->on('receiving_items')->nullOnDelete();
        });
    }

    /**
     * Kembalikan FK ke restrict (tanpa aksi hapus). Tidak mengubah
     * nullability maupun data.
     */
    public function down(): void
    {
        $this->dropForeignIfExists('batches', ['receiving_item_id']);
        Schema::table('batches', function (Blueprint $table) {
            $table->foreign('receiving_item_id')->references('id')->on('receiving_items');
        });

        $this->dropForeignIfExists('users', ['updated_by']);
        Schema::table('users', function (Blueprint $table) {
            $table->foreign('updated_by')->references('id')->on('users');
        });

        $this->dropForeignIfExists('opname_expired_session_items', ['verified_by']);
        Schema::table('opname_expired_session_items', function (Blueprint $table) {
            $table->foreign('verified_by')->references('id')->on('users');
        });

        $this->dropForeignIfExists('opname_expired_sessions', ['assigned_to', 'created_by']);
        Schema::table('opname_expired_sessions', function (Blueprint $table) {
            $table->foreign('assigned_to')->references('id')->on('users');
            $table->foreign('created_by')->references('id')->on('users');
        });
    }

    /**
     * Drop FK hanya bila benar-benar ada (sebagian tabel dibuat saat FK
     * check nonaktif sehingga constraint-nya tidak pernah ada).
     *
     * @param  array<int, string>  $columns
     */
    private function dropForeignIfExists(string $table, array $columns): void
    {
        $existing = collect(Schema::getForeignKeys($table))->map(fn (array $fk) => $fk['name'])->all();

        Schema::table($table, function (Blueprint $blueprint) use ($table, $columns, $existing) {
            foreach ($columns as $column) {
                if (in_array("{$table}_{$column}_foreign", $existing, true)) {
                    $blueprint->dropForeign([$column]);
                }
            }
        });
    }
};
