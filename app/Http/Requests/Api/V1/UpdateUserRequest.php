<?php

namespace App\Http\Requests\Api\V1;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Aturan validasi pembaruan user — dipindah utuh dari
 * UserController::update() tanpa perubahan.
 *
 * unique email memakai `$this->route('user')`: route memakai implicit
 * binding `{user}`, jadi route parameter berisi model User (atau id
 * saat validasi berjalan sebelum binding penuh). Kedua bentuk
 * ditangani — string id dipakai langsung, model diambil ->id.
 *
 * authorize() sengaja return true dengan alasan yang sama seperti
 * StoreUserRequest: otorisasi butuh target (UserPolicy + depot scope)
 * yang dievaluasi di controller setelah binding, bukan di sini.
 */
class UpdateUserRequest extends FormRequest
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
        $target = $this->route('user');
        $ignoreId = $target instanceof User ? $target->id : $target;

        return [
            'kode_depo' => 'sometimes|string|max:20',
            'nama_depo' => 'sometimes|string|max:100',
            'region_id' => 'sometimes|nullable|string|max:20',
            'full_name' => 'sometimes|string|max:100',
            'alamat' => 'nullable|string|max:2000',
            'email' => 'sometimes|email|max:255|unique:users,email,'.$ignoreId,
            'password' => 'nullable|string|min:8|confirmed',
            'level' => 'sometimes|in:'.implode(',', Role::LEVEL_SLUGS),
            'status' => 'sometimes|in:active,inactive',
        ];
    }
}
