<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Penerimaan;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class PenerimaanController extends Controller
{
    public function index(Request $request)
    {
        $query = Penerimaan::query()->forUserDepot($request->user());
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('no_shipment', 'like', '%'.$request->search.'%')
                    ->orWhere('No_Container', 'like', '%'.$request->search.'%')
                    ->orWhere('szNickName', 'like', '%'.$request->search.'%')
                    ->orWhere('BOSnetszProductId', 'like', '%'.$request->search.'%')
                    ->orWhere('szBarcode', 'like', '%'.$request->search.'%')
                    ->orWhere('request_id', 'like', '%'.$request->search.'%');
            });
        }
        if ($request->filled('kode_depo')) {
            $query->where('kode_depo', $request->kode_depo);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('tanggal_from')) {
            $query->where('tanggal_penerimaan', '>=', $request->tanggal_from);
        }
        if ($request->filled('tanggal_to')) {
            $query->where('tanggal_penerimaan', '<=', $request->tanggal_to);
        }
        $penerimaan = $query->orderBy('created_at', 'desc')->paginate($this->perPage($request, 50));

        return response()->json($penerimaan);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'tanggal_penerimaan' => 'nullable|date',
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
        abort_unless(
            $this->currentUser()->canAccessDepotRow($penerimaan->kode_depo, $penerimaan->nama_depo),
            403,
            'Data penerimaan tidak ditemukan di depo Anda.'
        );
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
            'tanggal_penerimaan' => 'nullable|date',
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

        if (isset($validated['status']) && $validated['status'] === 'completed') {
            $validated['completed_at'] = now();
        }

        $validated = $this->currentUser()->depotAttributes($validated);

        $penerimaan->update($validated);

        return response()->json(['message' => 'Penerimaan updated', 'data' => $penerimaan]);
    }

    public function destroy(Penerimaan $penerimaan)
    {
        $this->authorizeDepot($penerimaan);
        $penerimaan->delete();

        return response()->json(['message' => 'Penerimaan deleted']);
    }
}
