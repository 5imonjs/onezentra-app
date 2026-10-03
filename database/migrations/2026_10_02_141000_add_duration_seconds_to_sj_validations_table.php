<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Durasi validasi dalam detik.
     *
     * Nilainya sebenarnya bisa dihitung dari `completed_at - started_at`, tapi
     * disimpan karena kolom ini jadi bahan sortir/filter/laporan ("validasi mana
     * yang paling lama"). Kalau hanya dihitung on-the-fly di PHP, setiap laporan
     * harus menarik dua kolom lalu menghitung ulang, dan SQL pun tidak bisa
     * mengurutkan dengan benar.
     *
     * Diisi pada dua transisi terminal: `complete()` dan `cancel()`. Sesi
     * IN_PROGRESS dibiarkan NULL dan frontend menampilkan elapsed yang dihitung
     * di sisi klien — durasinya memang belum final, jadi menyimpannya tiap
     * menit hanya akan menulis baris berulang tanpa manfaat.
     *
     * Sesi CANCELLED tetap punya durasi: pembatalan adalah akhir pekerjaan.
     * `completed_at` sengaja dibiarkan NULL karena dokumennya tidak pernah
     * "selesai"; pembedaan antara "selesai" dan "dibatalkan" dibaca dari
     * `status`, bukan dari keberadaan timestamp.
     */
    public function up(): void
    {
        Schema::table('sj_validations', function (Blueprint $table) {
            $table->unsignedInteger('duration_seconds')->nullable()->after('completed_at');
        });

        // Backfill riwayat lama. Tanpa ini, semua sesi yang selesai sebelum kolom
        // ini ada akan tampil "–" padahal durasinya bisa dihitung dengan mudah.
        DB::table('sj_validations')
            ->whereNotNull('started_at')
            ->whereNotNull('completed_at')
            ->whereNull('duration_seconds')
            ->select('id', 'started_at', 'completed_at')
            ->orderBy('id')
            ->chunk(200, function ($rows): void {
                foreach ($rows as $row) {
                    $seconds = strtotime($row->completed_at) - strtotime($row->started_at);

                    // Durasi negatif berarti jam tidak konsisten (mis. koreksi
                    // manual). NULL lebih jujur daripada angka negatif yang akan
                    // tampil sebagai "−3j".
                    if ($seconds < 0) {
                        continue;
                    }

                    DB::table('sj_validations')
                        ->where('id', $row->id)
                        ->update(['duration_seconds' => $seconds]);
                }
            });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('sj_validations', function (Blueprint $table) {
            $table->dropColumn('duration_seconds');
        });
    }
};
