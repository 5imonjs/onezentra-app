<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class SyncUserDepotsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'depot_codes' => 'present|array',
            'depot_codes.*' => 'string|max:20|distinct',
        ];
    }

    public function messages(): array
    {
        return [
            'depot_codes.required' => 'Daftar depot wajib diisi.',
            'depot_codes.*.distinct' => 'Depot tidak boleh duplikat.',
        ];
    }
}
