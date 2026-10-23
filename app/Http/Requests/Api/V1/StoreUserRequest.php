<?php

namespace App\Http\Requests\Api\V1;

use App\Models\Role;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validasi akun baru dan role aktif yang boleh ditetapkan.
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
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'region_id' => ['nullable', 'string', 'max:20', Rule::exists('regions', 'code')],
            'depot_codes' => 'sometimes|array',
            'depot_codes.*' => 'string|max:20|distinct',
            'full_name' => 'required|string|max:100',
            'alamat' => 'nullable|string|max:2000',
            'email' => 'required|email|max:255|unique:users,email',
            'password' => 'required|string|min:8|confirmed',
            'level' => [
                'required',
                'string',
                function (string $attribute, mixed $value, Closure $fail): void {
                    $role = Role::where('slug', $value)->first();
                    $isLegacyRoleWithoutRow = $role === null && in_array($value, Role::LEVEL_SLUGS, true);
                    if (($role?->is_active ?? false) || $isLegacyRoleWithoutRow) {
                        return;
                    }

                    $fail('Role yang dipilih tidak aktif atau tidak valid.');
                },
            ],
            'status' => 'nullable|in:active,inactive',
        ];
    }
}
