<?php

namespace App\Policies;

use App\Models\User;

/**
 * Aturan akses untuk operasi pada user lain.
 *
 * Yang dikindle di sini HANYA aturan yang butuh knowing-mengenai actor
 * dan target — namely operasi terhadap akun `admin_master`. Gate permission
 * (`users.create`, `users.edit`, `users.delete`) tetap di level route lewat
 * middleware `permission:`.
 *
 * Kenapa tidak dipindahkan ke policy: middleware berjalan sebelum controller,
 * jadi menolak di sana berarti request belum menyentuh model dan query
 * belum jalan. Menangguhkan proteksi ke policy membalik urutan itu — biaya
 * naik, dan proteksi jadi tidak seragam (sebagian endpoint lewat middleware,
 * sebagian lewat policy).
 *
 * Policy ini jadi lapisan KEDUA, bukan pengganti. Kalau suatu saat gate route
 * dihapus, tiga aturan di sini tetap menutup jalur yang paling berbahaya,
 * tapi jangan	andalkan itu: hilangnya gate route adalah regresi yang harus
 * tertangkap test, bukan hal yang ditutupi policy.
 */
class UserPolicy
{
    /**
     * Menetapkan/menaikkan level ke `admin_master`.
     *
     * Ini cek level yang DIMINTA, bukan target — saat create tidak ada user
     * target yang sudah ada, jadi satu-satunya yang bisa dinilai adalah
     * payload dan siapa yang mengirimnya.
     */
    public function assignAdminMaster(User $actor, ?string $requestedLevel): bool
    {
        if ($requestedLevel !== 'admin_master') {
            return true;
        }

        return $actor->isAdminMaster();
    }

    /** Hanya admin master boleh mengubah akun admin master. */
    public function update(User $actor, User $target): bool
    {
        if ($target->isAdminMaster() && ! $actor->isAdminMaster()) {
            return false;
        }

        return true;
    }

    /**
     * Menghapus akun admin master.
     *
     * Pemeriksaan "user ini adalah admin master" TIDAK digabung di sini —
     * ia butuh=user target untuk deciding, dan aturan "jangan hapus akun
     * admin master terakhir" butuh query, jadi lebih tepat performed di
     * controller setelah policy lolos.
     */
    public function delete(User $actor, User $target): bool
    {
        if ($target->isAdminMaster() && ! $actor->isAdminMaster()) {
            return false;
        }

        return true;
    }
}
