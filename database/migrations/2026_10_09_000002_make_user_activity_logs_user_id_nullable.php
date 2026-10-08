<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Hapus user tidak boleh menghapus jejak audit aktivitasnya: rujukan
     * dinullkan, baris log tetap ada. Orphan user_id dinullkan dulu supaya
     * penambahan FK tidak gagal. Tidak menghapus baris mana pun.
     */
    public function up(): void
    {
        DB::table('user_activity_logs')
            ->whereNotNull('user_activity_logs.user_id')
            ->whereNotExists(function ($query) {
                $query->select(DB::raw(1))
                    ->from('users')
                    ->whereColumn('users.id', 'user_activity_logs.user_id');
            })
            ->update(['user_id' => null]);

        Schema::table('user_activity_logs', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
        });

        Schema::table('user_activity_logs', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->nullable()->change();
        });

        Schema::table('user_activity_logs', function (Blueprint $table) {
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    /**
     * Kembalikan ke cascadeOnDelete. Kolom dibiarkan nullable agar rollback
     * tidak menghapus baris log yang user_id-nya sudah NULL.
     */
    public function down(): void
    {
        Schema::table('user_activity_logs', function (Blueprint $table) {
            $table->dropForeign(['user_id']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }
};
