<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Membersihkan schema legacy yang tidak dipakai aplikasi:
 * - tabel `region_depo_access` (tanpa migration, tanpa model, tanpa referensi kode)
 * - kolom 2FA pada `users` (fitur 2FA tidak pernah diimplementasikan)
 * - kolom legacy `penerimaan` yang tidak pernah dibaca/ditulis
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('region_depo_access');

        $userColumns = array_values(array_filter(
            ['two_factor_secret', 'two_factor_recovery_codes', 'two_factor_confirmed_at'],
            fn (string $column): bool => Schema::hasColumn('users', $column),
        ));

        if ($userColumns !== []) {
            Schema::table('users', function (Blueprint $table) use ($userColumns): void {
                $table->dropColumn($userColumns);
            });
        }

        if (Schema::hasTable('penerimaan')) {
            if (Schema::hasIndex('penerimaan', 'cek_in_request_id_index')) {
                Schema::table('penerimaan', function (Blueprint $table): void {
                    $table->dropIndex('cek_in_request_id_index');
                });
            }

            $legacyColumns = array_values(array_filter(
                ['saved_by', 'DO_QTY', 'request_id'],
                fn (string $column): bool => Schema::hasColumn('penerimaan', $column),
            ));

            if ($legacyColumns !== []) {
                Schema::table('penerimaan', function (Blueprint $table) use ($legacyColumns): void {
                    $table->dropColumn($legacyColumns);
                });
            }
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('region_depo_access')) {
            Schema::create('region_depo_access', function (Blueprint $table): void {
                $table->increments('id');
                $table->integer('region_id');
                $table->integer('depo_id');
                $table->integer('user_id')->nullable();
                $table->string('role')->nullable();
                $table->timestamp('created_at')->nullable();
                $table->unique(['region_id', 'depo_id', 'user_id'], 'unique_region_depo_user');
            });
        }

        $missingUserColumns = array_values(array_filter(
            ['two_factor_secret', 'two_factor_recovery_codes', 'two_factor_confirmed_at'],
            fn (string $column): bool => ! Schema::hasColumn('users', $column),
        ));

        if ($missingUserColumns !== []) {
            Schema::table('users', function (Blueprint $table) use ($missingUserColumns): void {
                foreach ($missingUserColumns as $column) {
                    $column === 'two_factor_confirmed_at'
                        ? $table->timestamp($column)->nullable()
                        : $table->text($column)->nullable();
                }
            });
        }

        if (Schema::hasTable('penerimaan')) {
            $missingLegacyColumns = array_values(array_filter(
                ['saved_by', 'DO_QTY', 'request_id'],
                fn (string $column): bool => ! Schema::hasColumn('penerimaan', $column),
            ));

            if ($missingLegacyColumns !== []) {
                Schema::table('penerimaan', function (Blueprint $table) use ($missingLegacyColumns): void {
                    foreach ($missingLegacyColumns as $column) {
                        match ($column) {
                            'saved_by' => $table->unsignedBigInteger($column)->nullable(),
                            'DO_QTY' => $table->decimal($column, 15, 4)->nullable(),
                            'request_id' => $table->string($column)->nullable(),
                        };
                    }
                });
            }

            if (! Schema::hasIndex('penerimaan', 'cek_in_request_id_index')) {
                Schema::table('penerimaan', function (Blueprint $table): void {
                    $table->index('request_id', 'cek_in_request_id_index');
                });
            }
        }
    }
};
