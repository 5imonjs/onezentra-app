<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PartnerSite;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PartnerSiteController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $actor = $request->user();
        $query = PartnerSite::query()
            ->with('depot:kode_depo,nama_depo,region_id')
            ->where('is_active', true);

        if (! $actor->isMasterScope()) {
            if ($actor->scope_level === 'region') {
                $query->whereHas('depot', fn (Builder $depots): Builder => $depots->where('region_id', $actor->region_id));
            } elseif ($actor->scope_level === 'depot') {
                $query->where('kode_depo', $actor->kode_depo);
            } elseif ($actor->scope_level === 'ps') {
                $query->where('kode_ps', $actor->kode_ps);
            } else {
                $query->whereRaw('1 = 0');
            }
        }

        return response()->json(['data' => $query->orderBy('kode_ps')->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $actor = $request->user();
        abort_unless($actor->canCreatePartnerSite(), 403, 'Hanya Master atau pengguna scope Depo yang boleh membuat PS.');

        $validated = $request->validate([
            'kode_ps' => 'required|string|max:20|unique:partner_sites,kode_ps',
            'nama_ps' => 'required|string|max:150',
            'kode_depo' => ['required', 'string', Rule::exists('depot_settings', 'kode_depo')->where('is_active', true)],
        ]);
        abort_if(
            $actor->scope_level === 'depot' && $validated['kode_depo'] !== $actor->kode_depo,
            403,
            'Anda hanya dapat membuat PS di depo Anda.'
        );

        $partnerSite = PartnerSite::create($validated);

        return response()->json([
            'message' => 'Partner Site berhasil dibuat.',
            'data' => $partnerSite->load('depot:kode_depo,nama_depo,region_id'),
        ], 201);
    }
}
