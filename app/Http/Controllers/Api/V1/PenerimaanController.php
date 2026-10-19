<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Concerns\AuthorizesDepotRow;
use App\Http\Controllers\Controller;
use App\Models\Penerimaan;
use App\Support\LikePattern;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PenerimaanController extends Controller
{
    use AuthorizesDepotRow;

    public function index(Request $request)
    {
        $query = Penerimaan::query()->forUserDepot($request->user());
        if ($request->filled('search')) {
            $like = LikePattern::contains($request->search);
            $query->where(function ($q) use ($like) {
                $q->whereRaw('no_shipment LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('No_Container LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szNickName LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('BOSnetszProductId LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szBarcode LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('request_id LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }
        if ($request->filled('kode_depo')) {
            $query->where('kode_depo', $request->kode_depo);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('tanggal_from')) {
            $request->validate(['tanggal_from' => 'date']);
            $query->where('tanggal_penerimaan', '>=', $request->tanggal_from);
        }
        if ($request->filled('tanggal_to')) {
            $request->validate(['tanggal_to' => 'date']);
            $query->where('tanggal_penerimaan', '<=', $request->tanggal_to);
        }
        $penerimaan = $query->orderBy('created_at', 'desc')->paginate($this->perPage($request, 50));

        return response()->json($penerimaan);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'tanggal_penerimaan' => 'nullable|date|before_or_equal:today',
            'no_shipment' => 'nullable|string|max:50',
            'No_Container' => 'nullable|string|max:50',
            'szBarcode' => 'nullable|string|max:20',
            'BOSnetszProductId' => 'nullable|string|max:20',
            'SAPszProductId' => 'nullable|string|max:20',
            'szNickName' => 'nullable|string|max:50',
            'szCompUomDesc' => 'nullable|string|max:50',
            'BOSnetdecUom' => 'nullable|string|max:50',
            'SAPszUomId' => 'nullable|string|max:50',
            'SAPdecUom' => 'nullable|string|max:50',
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'DO_QTY' => 'nullable|numeric|min:0',
            'expired_date' => 'nullable|date',
            'szStatus' => 'nullable|string|max:20',
        ]);

        $this->assertExpiredAfterPenerimaan(
            $validated['expired_date'] ?? null,
            $validated['tanggal_penerimaan'] ?? null
        );

        $validated['saved_by'] = Auth::id();
        $validated['status'] = 'draft';
        $validated = $this->currentUser()->depotAttributes($validated);

        if (! isset($validated['request_id'])) {
            $validated['request_id'] = strtoupper(uniqid('PIM-'));
        }

        $penerimaan = Penerimaan::create($validated);

        return response()->json(['message' => 'Penerimaan created', 'data' => $penerimaan], 201);
    }

    private function authorizeDepot(Penerimaan $penerimaan): void
    {
        $this->authorizeDepotRow(
            $penerimaan->kode_depo,
            $penerimaan->nama_depo,
            'Data penerimaan tidak ditemukan di depo Anda.'
        );
    }

    /**
     * expired_date tidak boleh lebih awal dari tanggal_penerimaan.
     * Dibandingkan manual (bukan rule after_or_equal) agar update yang hanya
     * mengirim salah satu field tetap dibandingkan dengan nilai tersimpan.
     */
    private function assertExpiredAfterPenerimaan(mixed $expiredDate, mixed $tanggalPenerimaan): void
    {
        if (blank($expiredDate) || blank($tanggalPenerimaan)) {
            return;
        }

        if (strtotime((string) $expiredDate) < strtotime((string) $tanggalPenerimaan)) {
            throw ValidationException::withMessages([
                'expired_date' => ['Expired date tidak boleh lebih awal dari tanggal penerimaan.'],
            ]);
        }
    }

    public function show(Penerimaan $penerimaan)
    {
        $this->authorizeDepot($penerimaan);

        return response()->json(['data' => $penerimaan->load('savedBy')]);
    }

    public function update(Request $request, Penerimaan $penerimaan)
    {
        $this->authorizeDepot($penerimaan);

        $validated = $request->validate([
            'tanggal_penerimaan' => 'nullable|date|before_or_equal:today',
            'no_shipment' => 'nullable|string|max:50',
            'No_Container' => 'nullable|string|max:50',
            'szBarcode' => 'nullable|string|max:20',
            'BOSnetszProductId' => 'nullable|string|max:20',
            'SAPszProductId' => 'nullable|string|max:20',
            'szNickName' => 'nullable|string|max:50',
            'szCompUomDesc' => 'nullable|string|max:50',
            'BOSnetdecUom' => 'nullable|string|max:50',
            'SAPszUomId' => 'nullable|string|max:50',
            'SAPdecUom' => 'nullable|string|max:50',
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'DO_QTY' => 'nullable|numeric|min:0',
            'expired_date' => 'nullable|date',
            'szStatus' => 'nullable|string|max:20',
            'status' => 'nullable|in:draft,completed,cancelled',
        ]);

        $this->assertExpiredAfterPenerimaan(
            $validated['expired_date'] ?? null,
            $validated['tanggal_penerimaan'] ?? $penerimaan->tanggal_penerimaan?->toDateString()
        );

        DB::transaction(function () use ($request, $penerimaan, $validated): void {
            $locked = Penerimaan::whereKey($penerimaan->id)->lockForUpdate()->firstOrFail();

            // Revert completed → draft hanya untuk admin_master; completed_at
            // dibersihkan supaya jejak "pernah selesai" tidak menyesatkan.
            if (array_key_exists('status', $validated)
                && $locked->status === 'completed'
                && $validated['status'] !== 'completed'
                && ! $request->user()->isAdminMaster()) {
                abort(403, 'Penerimaan yang sudah completed hanya dapat direvert oleh admin_master.');
            }

            $payload = $validated;
            if (array_key_exists('status', $validated)) {
                if ($validated['status'] === 'completed') {
                    $payload['completed_at'] = now();
                } elseif ($locked->status === 'completed' && $validated['status'] !== 'completed') {
                    $payload['completed_at'] = null;
                }
            }

            $payload = $this->currentUser()->depotAttributes($payload);

            $locked->update($payload);
        });

        return response()->json(['message' => 'Penerimaan updated', 'data' => $penerimaan->refresh()]);
    }

    public function destroy(Penerimaan $penerimaan)
    {
        $this->authorizeDepot($penerimaan);

        DB::transaction(function () use ($penerimaan): void {
            $locked = Penerimaan::whereKey($penerimaan->id)->lockForUpdate()->firstOrFail();

            abort_unless(
                $locked->status !== 'completed' || request()->user()->isAdminMaster(),
                422,
                'Penerimaan yang sudah COMPLETED tidak dapat dihapus kecuali oleh admin_master.'
            );

            $locked->delete();
        });

        return response()->json(['message' => 'Penerimaan deleted']);
    }
}
