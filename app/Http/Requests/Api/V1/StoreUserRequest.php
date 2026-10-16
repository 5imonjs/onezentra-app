<?php

namespace App\Http\Requests\Api\V1;

use App\Models\Role;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Aturan validasi pembuatan user — dipindah utuh dari
 * UserController::store() tanpa perubahan.
 *
 * authorize() sengaja return true: otorisasi dilakukan di DUA tempat
 * yang tidak bisa digabung di sini — middleware `permission:users.create`
 * di level route (cek permission pemanggil) dan UserPolicy
 * `assignAdminMaster` di controller (cek level yang diminta vs aktor).
 * Form Request tidak punya akses ke keduanya sekaligus, jadi memindahkan
 * authorize ke sini hanya menduplikasi tanpa menambah proteksi.
 */
class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, string>
     */
    public function rules(): array
    {
        return [
            'kode_depo' => 'required|string|max:20',
            'nama_depo' => 'required|string|max:100',
            'full_name' => 'required|string|max:100',
            'alamat' => 'nullable|string|max:2000',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
            'level' => 'required|in:'.implode(',', Role::LEVEL_SLUGS),
            'status' => 'nullable|in:active,inactive',
        ];
    }
}
