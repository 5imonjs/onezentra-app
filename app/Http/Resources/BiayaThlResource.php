<?php

namespace App\Http\Resources;

use App\Models\ApprovalAssignment;
use App\Services\Biaya\BiayaApprovalPresenter;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Representasi satu pengajuan Biaya THL pada API.
 *
 * Bentuk dasar mengikuti atribut + relasi yang sudah dimuat pada model
 * (kontrak lama dipertahankan agar frontend tak berubah). Kotak approval
 * hanya disertakan saat diminta eksplisit lewat withApprovalSections() agar
 * endpoint daftar tidak ikut membangunnya untuk setiap baris.
 */
class BiayaThlResource extends JsonResource
{
    private bool $withApprovalSections = false;

    public function withApprovalSections(): static
    {
        $this->withApprovalSections = true;

        return $this;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $data = $this->resource->toArray();

        if ($this->withApprovalSections) {
            $data['approval_sections'] = app(BiayaApprovalPresenter::class)
                ->approvalSectionsFor($this->resource, ApprovalAssignment::MODULE_THL);
        }

        return $data;
    }
}
