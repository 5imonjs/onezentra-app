<?php

namespace App\Http\Requests\Api\V1;

use App\Http\Requests\Api\V1\Concerns\NormalizesSingleDepotPayload;
use App\Models\Role;
use App\Models\User;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validasi pembaruan profil, role, dan assignment depo user.
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
    use NormalizesSingleDepotPayload;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $target = $this->route('user');
        $ignoreId = $target instanceof User ? $target->id : $target;

        return [
            'kode_depo' => 'sometimes|nullable|string|max:20',
            'nama_depo' => 'sometimes|nullable|string|max:100',
            'region_id' => ['sometimes', 'nullable', 'string', 'max:20', Rule::exists('regions', 'code')],
            'scope_level' => 'sometimes|in:master,region,depot,ps',
            'kode_ps' => [
                'sometimes',
                'nullable',
                'string',
                'max:20',
                Rule::exists('partner_sites', 'kode_ps'),
            ],
            'depot_codes' => 'sometimes|array|max:1',
            'depot_codes.*' => 'string|max:20|distinct',
            'full_name' => 'sometimes|string|max:100',
            'alamat' => 'nullable|string|max:2000',
            'email' => 'sometimes|email|max:255|unique:users,email,'.$ignoreId,
            'password' => 'nullable|string|min:8|confirmed',
            'level' => [
                'sometimes',
                'string',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (Role::where('slug', $value)->exists() || in_array($value, Role::LEVEL_SLUGS, true)) {
                        return;
                    }

                    $fail('Role yang dipilih tidak valid.');
                },
            ],
            'status' => 'sometimes|in:active,inactive',
        ];
    }
}
