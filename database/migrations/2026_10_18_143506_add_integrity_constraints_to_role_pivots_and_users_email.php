<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Hapus baris pivot menggantung sebelum FK dipasang (aman: hanya baris
     * yatim, bukan data valid). Delete dipakai karena pivot tanpa parent
     * memang tidak punya makna.
     */
    private function deleteOrphans(string $table, string $column, string $refTable): void
    {
        DB::table($table)
            ->whereNotExists(function ($query) use ($table, $column, $refTable): void {
                $query->select(DB::raw(1))
                    ->from($refTable)
                    ->whereColumn("{$refTable}.id", "{$table}.{$column}");
            })
            ->delete();
    }

    /**
     * Email duplikat membuat login ambigu (siapa yang cocok?). Sisakan baris
     * dengan id terkecil, beri sufiks unik pada duplikat lain tanpa
     * menghapus user apa pun.
     */
    private function deduplicateUserEmails(): void
    {
        $duplicates = DB::table('users')
            ->select('email', DB::raw('MIN(id) as keep_id'))
            ->whereNotNull('email')
            ->groupBy('email')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        foreach ($duplicates as $duplicate) {
            $rows = DB::table('users')
                ->where('email', $duplicate->email)
                ->where('id', '<>', $duplicate->keep_id)
                ->orderBy('id')
                ->pluck('id');

            foreach ($rows as $id) {
                [$local, $domain] = array_pad(explode('@', (string) $duplicate->email, 2), 2, 'invalid');
                DB::table('users')->where('id', $id)->update([
                    'email' => $local.'+dup'.$id.'@'.$domain,
                ]);
            }
        }
    }

    public function up(): void
    {
        $this->deleteOrphans('role_user', 'user_id', 'users');
        $this->deleteOrphans('role_user', 'role_id', 'roles');
        $this->deleteOrphans('role_permission', 'role_id', 'roles');
        $this->deleteOrphans('role_permission', 'permission_id', 'permissions');

        if (! Schema::hasForeignKey('role_user', 'role_user_user_id_foreign')) {
            Schema::table('role_user', function (Blueprint $table): void {
                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            });
        }
        if (! Schema::hasForeignKey('role_user', 'role_user_role_id_foreign')) {
            Schema::table('role_user', function (Blueprint $table): void {
                $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
            });
        }
        if (! Schema::hasForeignKey('role_permission', 'role_permission_role_id_foreign')) {
            Schema::table('role_permission', function (Blueprint $table): void {
                $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
            });
        }
        if (! Schema::hasForeignKey('role_permission', 'role_permission_permission_id_foreign')) {
            Schema::table('role_permission', function (Blueprint $table): void {
                $table->foreign('permission_id')->references('id')->on('permissions')->cascadeOnDelete();
            });
        }

        $this->deduplicateUserEmails();

        if (! Schema::hasIndex('users', 'users_email_unique')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->unique('email');
            });
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique(['email']);
        });

        Schema::table('role_user', function (Blueprint $table): void {
            $table->dropForeign(['user_id']);
            $table->dropForeign(['role_id']);
        });

        Schema::table('role_permission', function (Blueprint $table): void {
            $table->dropForeign(['role_id']);
            $table->dropForeign(['permission_id']);
        });
    }
};
