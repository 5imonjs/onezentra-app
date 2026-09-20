<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if ($this->canAlterEnum()) {
            // Perluas enum sementara: terima 'rfha' (lama) sekaligus 'rfah' (baru)
            // agar data existing tetap valid saat MySQL mengubah definisi kolom.
            Schema::table('users', function (Blueprint $table) {
                $table->enum('level', [
                    'admin_master', 'staff_logistic', 'rlh', 'rfha', 'rfah', 'rh',
                    'blc', 'bac', 'admin_distirbusi', 'admin_planner', 'cheker',
                ])->default('admin_master')->change();
            });
        }

        DB::table('users')->where('level', 'rfha')->update(['level' => 'rfah']);

        if (Schema::hasColumn('users', 'role_slug')) {
            DB::table('users')->where('role_slug', 'rfha')->update(['role_slug' => 'rfah']);
        }

        DB::table('users')->where('kode_depo', 'RFHA-01')->update(['kode_depo' => 'RFAH-01']);
        DB::table('users')->where('nama_depo', 'Depo RFHA')->update(['nama_depo' => 'Depo RFAH']);
        DB::table('users')->where('full_name', 'User RFHA')->update(['full_name' => 'User RFAH']);
        DB::table('users')->where('full_name', 'RFHA Singkawang')->update(['full_name' => 'RFAH Singkawang']);
        DB::table('users')->where('email', 'rfha@onezentra.com')->update(['email' => 'rfah@onezentra.com']);
        DB::table('users')->where('email', 'rfha.singkawang@onezentra.com')->update(['email' => 'rfah.singkawang@onezentra.com']);

        DB::table('roles')->where('slug', 'rfha')->update(['slug' => 'rfah']);
        DB::table('roles')->where('name', 'RFHA')->update(['name' => 'RFAH', 'description' => 'Role RFAH']);

        if ($this->canAlterEnum()) {
            // Sempitkan enum kembali: hanya 'rfah', tanpa 'rfha'.
            Schema::table('users', function (Blueprint $table) {
                $table->enum('level', [
                    'admin_master', 'staff_logistic', 'rlh', 'rfah', 'rh',
                    'blc', 'bac', 'admin_distirbusi', 'admin_planner', 'cheker',
                ])->default('admin_master')->change();
            });
        }
    }

    public function down(): void
    {
        if ($this->canAlterEnum()) {
            Schema::table('users', function (Blueprint $table) {
                $table->enum('level', [
                    'admin_master', 'staff_logistic', 'rlh', 'rfha', 'rfah', 'rh',
                    'blc', 'bac', 'admin_distirbusi', 'admin_planner', 'cheker',
                ])->default('admin_master')->change();
            });
        }

        DB::table('users')->where('level', 'rfah')->update(['level' => 'rfha']);

        if (Schema::hasColumn('users', 'role_slug')) {
            DB::table('users')->where('role_slug', 'rfah')->update(['role_slug' => 'rfha']);
        }

        DB::table('users')->where('kode_depo', 'RFAH-01')->update(['kode_depo' => 'RFHA-01']);
        DB::table('users')->where('nama_depo', 'Depo RFAH')->update(['nama_depo' => 'Depo RFHA']);
        DB::table('users')->where('full_name', 'User RFAH')->update(['full_name' => 'User RFHA']);
        DB::table('users')->where('full_name', 'RFAH Singkawang')->update(['full_name' => 'RFHA Singkawang']);
        DB::table('users')->where('email', 'rfah@onezentra.com')->update(['email' => 'rfha@onezentra.com']);
        DB::table('users')->where('email', 'rfah.singkawang@onezentra.com')->update(['email' => 'rfha.singkawang@onezentra.com']);

        DB::table('roles')->where('name', 'RFAH')->update(['name' => 'RFHA', 'description' => 'Role RFHA']);
        DB::table('roles')->where('slug', 'rfah')->update(['slug' => 'rfha']);

        if ($this->canAlterEnum()) {
            Schema::table('users', function (Blueprint $table) {
                $table->enum('level', [
                    'admin_master', 'staff_logistic', 'rlh', 'rfha', 'rh',
                    'blc', 'bac', 'admin_distirbusi', 'admin_planner', 'cheker',
                ])->default('admin_master')->change();
            });
        }
    }

    /**
     * SQLite mem-encode enum sebagai CHECK constraint saat rebuild,
     * yang tidak pernah dibuat oleh rangkaian migration lama (check
     * terhapus oleh rebuild berikutnya). DDL enum hanya relevan untuk
     * driver yang benar-benar menegakkan enum seperti MySQL.
     */
    private function canAlterEnum(): bool
    {
        return DB::connection()->getDriverName() !== 'sqlite';
    }
};
