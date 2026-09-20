<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Lepas constraint lama yang benar-benar ada sebelum rename tabel/kolom.
        foreach (['shipment_items', 'gate_transactions', 'receivings', 'sj_validations'] as $table) {
            $this->dropForeignByColumn($table, 'shipment_id');
            $this->dropIndexByColumn($table, 'shipment_id');
        }
        foreach (['receiving_items', 'sj_validation_items'] as $table) {
            $this->dropForeignByColumn($table, 'shipment_item_id');
            $this->dropIndexByColumn($table, 'shipment_item_id');
        }

        if (Schema::hasTable('shipments') && ! Schema::hasTable('rencana_kirim')) {
            Schema::rename('shipments', 'rencana_kirim');
        }
        if (Schema::hasTable('shipment_items') && ! Schema::hasTable('rencana_kirim_items')) {
            Schema::rename('shipment_items', 'rencana_kirim_items');
        }

        $this->renameColumnAndRestore('rencana_kirim_items', 'shipment_id', 'rencana_kirim_id', 'rencana_kirim', 'cascade');
        $this->renameColumnAndRestore('gate_transactions', 'shipment_id', 'rencana_kirim_id', 'rencana_kirim', 'cascade');
        $this->renameColumnAndRestore('receivings', 'shipment_id', 'rencana_kirim_id', 'rencana_kirim', 'cascade');
        $this->renameColumnAndRestore('sj_validations', 'shipment_id', 'rencana_kirim_id', 'rencana_kirim', 'cascade');
        $this->renameColumnAndRestore('receiving_items', 'shipment_item_id', 'rencana_kirim_item_id', 'rencana_kirim_items', 'set null');
        $this->renameColumnAndRestore('sj_validation_items', 'shipment_item_id', 'rencana_kirim_item_id', 'rencana_kirim_items', 'cascade');

        $this->renamePermissionSlugs();
    }

    public function down(): void
    {
        $this->renamePermissionSlugs(restore: true);

        foreach (['rencana_kirim_items', 'gate_transactions', 'receivings', 'sj_validations'] as $table) {
            $this->dropForeignByColumn($table, 'rencana_kirim_id');
            $this->dropIndexByColumn($table, 'rencana_kirim_id');
        }
        foreach (['receiving_items', 'sj_validation_items'] as $table) {
            $this->dropForeignByColumn($table, 'rencana_kirim_item_id');
            $this->dropIndexByColumn($table, 'rencana_kirim_item_id');
        }

        Schema::rename('rencana_kirim', 'shipments');
        Schema::rename('rencana_kirim_items', 'shipment_items');
        $this->renameColumnAndRestore('shipment_items', 'rencana_kirim_id', 'shipment_id', 'shipments', 'cascade');
        $this->renameColumnAndRestore('gate_transactions', 'rencana_kirim_id', 'shipment_id', 'shipments', 'cascade');
        $this->renameColumnAndRestore('receivings', 'rencana_kirim_id', 'shipment_id', 'shipments', 'cascade');
        $this->renameColumnAndRestore('sj_validations', 'rencana_kirim_id', 'shipment_id', 'shipments', 'cascade');
        $this->renameColumnAndRestore('receiving_items', 'rencana_kirim_item_id', 'shipment_item_id', 'shipment_items', 'set null');
        $this->renameColumnAndRestore('sj_validation_items', 'rencana_kirim_item_id', 'shipment_item_id', 'shipment_items', 'cascade');
    }

    private function dropForeignByColumn(string $table, string $column): void
    {
        if ($this->isSqlite()) {
            return;
        }
        $constraints = DB::select(
            'SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL',
            [$table, $column]
        );
        foreach ($constraints as $c) {
            DB::statement('ALTER TABLE `'.$table.'` DROP FOREIGN KEY `'.$c->CONSTRAINT_NAME.'`');
        }
    }

    private function dropIndexByColumn(string $table, string $column): void
    {
        if ($this->isSqlite()) {
            return;
        }
        $rows = DB::select(
            'SELECT INDEX_NAME FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND INDEX_NAME != "PRIMARY"',
            [$table, $column]
        );
        foreach ($rows as $row) {
            Schema::table($table, function (Blueprint $t) use ($row) {
                $t->dropIndex($row->INDEX_NAME);
            });
        }
    }

    private function renameColumnAndRestore(string $table, string $from, string $to, string $refTable, string $onDelete): void
    {
        Schema::table($table, function (Blueprint $t) use ($table, $from, $to) {
            if (Schema::hasColumn($table, $from) && ! Schema::hasColumn($table, $to)) {
                $t->renameColumn($from, $to);
            }
        });

        if ($this->constraintExists($table, $to)) {
            return;
        }
        Schema::table($table, function (Blueprint $t) use ($to, $refTable, $onDelete) {
            $t->foreign($to)->references('id')->on($refTable)->onDelete($onDelete);
            $t->index($to);
        });
    }

    private function constraintExists(string $table, string $column): bool
    {
        if ($this->isSqlite()) {
            return false;
        }

        return count(DB::select(
            'SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1',
            [$table, $column]
        )) > 0;
    }

    /**
     * Query information_schema hanya ada di MySQL. Pada sqlite (test),
     * database selalu dibangun fresh sehingga tidak ada constraint lama
     * yang perlu dilepas — lewati saja.
     */
    private function isSqlite(): bool
    {
        return DB::getDriverName() === 'sqlite';
    }

    private function renamePermissionSlugs(bool $restore = false): void
    {
        $fromSuffix = $restore ? 'rencana_kirim.' : 'shipments.';
        $toSuffix = $restore ? 'shipments.' : 'rencana_kirim.';
        $fromPrefix = $restore ? 'Rencana Kirim' : 'Shipments';
        $toPrefix = $restore ? 'Shipments' : 'Rencana Kirim';

        $rows = DB::table('permissions')
            ->where('slug', 'like', $fromSuffix.'%')
            ->get(['id', 'slug', 'route', 'name', 'menu_group']);

        foreach ($rows as $row) {
            DB::table('permissions')->where('id', $row->id)->update([
                'slug' => $toSuffix.substr((string) $row->slug, strlen($fromSuffix)),
                'route' => $toSuffix.substr((string) $row->route, strlen($fromSuffix)),
                'name' => $toPrefix.substr((string) $row->name, strlen($fromPrefix)),
                'menu_group' => $toPrefix.substr((string) $row->menu_group, strlen($fromPrefix)),
            ]);
        }
    }
};
