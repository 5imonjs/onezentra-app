<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Mail\StandarisasiStatusNotification;
use App\Models\StandarisasiTumpukan;
use App\Services\EmailNotificationService;
use Illuminate\Http\Request;

class StandarisasiTumpukanController extends Controller
{
    public function __construct(private EmailNotificationService $emailService) {}

    public function index(Request $request)
    {
        $query = StandarisasiTumpukan::query()->forUserDepot($request->user());
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->whereHas('npn', function ($npn) use ($request) {
                    $npn->where('szNickName', 'like', '%'.$request->search.'%')
                        ->orWhere('szNickNameNew', 'like', '%'.$request->search.'%')
                        ->orWhere('BOSnetszProductId', 'like', '%'.$request->search.'%')
                        ->orWhere('szBarcode', 'like', '%'.$request->search.'%');
                })->orWhere('kode_depo', 'like', '%'.$request->search.'%');
            });
        }
        if ($request->filled('kode_depo')) {
            $query->where('kode_depo', $request->kode_depo);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        $standarisasi = $query->with('npn:id,BOSnetszProductId,SAPszProductId,szNickName,szNickNameNew,szBarcode,szBarcodeSekunder,szBarcodeTersier')
            ->orderBy('created_at', 'desc')
            ->paginate($this->perPage($request, 50));

        return response()->json($standarisasi);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'npn_id' => 'required|integer|exists:npn,id',
            'tier' => 'nullable|integer|min:1',
            'tinggi_tumpukan' => 'nullable|integer|min:1',
            'kode_depo' => 'nullable|string|max:50',
            'nama_depo' => 'nullable|string|max:150',
        ]);

        $validated['requested_by'] = auth()->id();
        $validated['requested_by_email'] = auth()->user()->email;
        $validated['status'] = 'pending';
        $validated = auth()->user()->depotAttributes($validated);

        $validated['total_tier_tinggi'] = ($validated['tier'] ?? 0) * ($validated['tinggi_tumpukan'] ?? 0);

        $standarisasi = StandarisasiTumpukan::create($validated);

        $this->emailService->send(
            'standarisasi_tumpukan',
            'submitted',
            $standarisasi->fresh(['npn']),
            new StandarisasiStatusNotification($standarisasi->fresh(['npn']))
        );

        return response()->json(['message' => 'Standarisasi tumpukan created', 'data' => $standarisasi->load('npn')], 201);
    }

    private function authorizeDepot(StandarisasiTumpukan $standarisasiTumpukan): void
    {
        $user = auth()->user();
        if ($user && ($user->level === 'admin_master' || $user->hasRole('blc') || $user->hasRole('staff_logistic'))) {
            return;
        }
        abort_unless(
            $user?->canAccessDepotRow($standarisasiTumpukan->kode_depo, $standarisasiTumpukan->nama_depo),
            403,
            'Data standarisasi tidak ditemukan di depo Anda.'
        );
    }

    public function show(StandarisasiTumpukan $standarisasiTumpukan)
    {
        $this->authorizeDepot($standarisasiTumpukan);

        return response()->json(['data' => $standarisasiTumpukan->load('npn')]);
    }

    public function update(Request $request, StandarisasiTumpukan $standarisasiTumpukan)
    {
        $this->authorizeDepot($standarisasiTumpukan);

        $validated = $request->validate([
            'npn_id' => 'nullable|integer|exists:npn,id',
            'tier' => 'nullable|integer|min:1',
            'tinggi_tumpukan' => 'nullable|integer|min:1',
            'status' => 'nullable|in:pending,approved,rejected',
        ]);

        if (isset($validated['tier']) || isset($validated['tinggi_tumpukan'])) {
            $validated['total_tier_tinggi'] = ($validated['tier'] ?? $standarisasiTumpukan->tier ?? 0) * ($validated['tinggi_tumpukan'] ?? $standarisasiTumpukan->tinggi_tumpukan ?? 0);
        }
        if (isset($validated['status']) && $validated['status'] === 'approved') {
            $validated['approved_by'] = auth()->id();
            $validated['approved_by_email'] = auth()->user()->email;
        }

        $standarisasiTumpukan->update($validated);

        return response()->json(['message' => 'Standarisasi tumpukan updated', 'data' => $standarisasiTumpukan->refresh()->load('npn')]);
    }

    public function approve(Request $request, StandarisasiTumpukan $standarisasiTumpukan)
    {
        $this->authorizeDepot($standarisasiTumpukan);

        $standarisasiTumpukan->update([
            'status' => 'approved',
            'approved_by' => auth()->id(),
            'approved_by_email' => auth()->user()->email,
            'total_tier_tinggi' => ($standarisasiTumpukan->tier ?? 0) * ($standarisasiTumpukan->tinggi_tumpukan ?? 0),
        ]);

        $this->emailService->send(
            'standarisasi_tumpukan',
            'approved',
            $standarisasiTumpukan->fresh(['npn']),
            new StandarisasiStatusNotification($standarisasiTumpukan->fresh(['npn']))
        );

        return response()->json(['message' => 'Standarisasi tumpukan disetujui', 'data' => $standarisasiTumpukan->refresh()->load('npn')]);
    }

    public function reject(Request $request, StandarisasiTumpukan $standarisasiTumpukan)
    {
        $this->authorizeDepot($standarisasiTumpukan);

        $standarisasiTumpukan->update([
            'status' => 'rejected',
        ]);

        $this->emailService->send(
            'standarisasi_tumpukan',
            'rejected',
            $standarisasiTumpukan->fresh(['npn']),
            new StandarisasiStatusNotification($standarisasiTumpukan->fresh(['npn']))
        );

        return response()->json(['message' => 'Standarisasi tumpukan ditolak', 'data' => $standarisasiTumpukan->refresh()->load('npn')]);
    }

    public function destroy(StandarisasiTumpukan $standarisasiTumpukan)
    {
        $this->authorizeDepot($standarisasiTumpukan);
        $standarisasiTumpukan->delete();

        return response()->json(['message' => 'Standarisasi tumpukan deleted']);
    }
}
