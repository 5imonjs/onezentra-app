<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Hapus user tidak boleh menghapus penugasan approval depo: rujukan
     * dinullkan, baris assignment tetap ada. Orphan user_id dinullkan dulu
     * supaya penambahan FK tidak gagal. Tidak menghapus baris mana pun.
     */
    public function up(): void
    {
        DB::table('approval_assignments')
            ->whereNotNull('approval_assignments.user_id')
            ->whereNotExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('users')
                    ->whereColumn('users.id', 'approval_assignments.user_id');
            })
            ->update(['user_id' => null]);

        Schema::table('approval_assignments', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });

        Schema::table('approval_assignments', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->nullable()->change();
        });

        Schema::table('approval_assignments', function (Blueprint $table) {
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    /**
     * Kembalikan ke cascadeOnDelete. Kolom dibiarkan nullable agar rollback
     * tidak menghapus baris assignment yang user_id-nya sudah NULL.
     */
    public function down(): void
    {
        Schema::table('approval_assignments', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }
};
