<?php

namespace App\Http\Controllers\Concerns;

/**
 * Pemeriksaan akses baris milik depo.
 *
 * Dipakai controller yang|access satu baris lewat
 * `User::canAccessDepotRow()`. Logikanya TIDAK berubah oleh trait ini —
 * yang dipindahkan hanya pemanggilan `abort_unless()` yang sebelumnya
 * ditulis ulang di enam controller dengan bentuk identik.
 *
 * Yang SENGAJA tetap di tiap controller:
 *  - cara memperoleh kode_depo/nama_depo dari model (beda tiap model)
 *  - pesan error (beda per modul, dan itu yang dilihat user)
 *  - pemeriksaan tambahan apa pun, mis. `Auth::user() instanceof User`
 *
 * Trait ini hanya menyediakan satu jalan untuk satu aturan. Kalau suatu saat
 * sebuah controller butuh aturan berbeda, jangan dipaksa masuk ke sini.
 */
trait AuthorizesDepotRow
{
    /**
     * Abort 403 bila baris di luar depo user.
     *
     * Pesan dikembalikan apa adanya supaya tiap modul bisa memakai
     * penjelasannya sendiri; pesan global akan membocorkan
     * dan membingungkan user.
     *
     * @param  string  $message  pesan 403 untuk modul pemanggil
     */
    protected function authorizeDepotRow(?string $kodeDepo, ?string $namaDepo, string $message): void
    {
        abort_unless(
            $this->currentUser()->canAccessDepotRow($kodeDepo, $namaDepo),
            403,
            $message
        );
    }
}
