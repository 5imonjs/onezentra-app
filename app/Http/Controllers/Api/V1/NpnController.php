<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\NpnExport;
use App\Http\Controllers\Controller;
use App\Imports\NpnImport;
use App\Models\Npn;
use App\Models\StandarUmurProduk;
use App\Services\ExportGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Maatwebsite\Excel\Facades\Excel;
use Maatwebsite\Excel\Validators\ValidationException;

class NpnController extends Controller
{
    public function index(Request $request)
    {
        $query = Npn::query();
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('szNickName', 'like', '%'.$request->search.'%')
                    ->orWhere('BOSnetszProductId', 'like', '%'.$request->search.'%')
                    ->orWhere('SAPszProductId', 'like', '%'.$request->search.'%')
                    ->orWhere('szShortDescription', 'like', '%'.$request->search.'%')
                    ->orWhere('szBarcode', 'like', '%'.$request->search.'%');
            });
        }
        if ($request->filled('kode_depo')) {
            $query->where('kode_depo', $request->kode_depo);
        }
        if ($request->filled('szStatus')) {
            $query->where('szStatus', $request->szStatus);
        }
        $sortable = ['szNickName', 'szNickNameNew', 'BOSnetszProductId', 'SAPszProductId', 'szBarcode', 'szStatus'];
        $sort = $request->input('sort', 'szNickName');
        $direction = strtolower((string) $request->input('direction', 'asc')) === 'desc' ? 'desc' : 'asc';
        if (! in_array($sort, $sortable, true)) {
            $sort = 'szNickName';
            $direction = 'asc';
        }
        $npn = $query->orderBy($sort, $direction)->paginate($this->perPage($request, 50));

        return response()->json($npn);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'kode_depo' => 'nullable|string|max:255',
            'nama_depo' => 'nullable|string|max:255',
            'BOSnetszProductId' => 'nullable|string|max:20',
            'SAPszProductId' => 'nullable|string|max:20',
            'szNickName' => 'nullable|string|max:50',
            'szShortDescription' => 'nullable|string|max:255',
        ]);

        $validated['created_by'] = Auth::id();
        $npn = Npn::create($validated);

        return response()->json(['message' => 'NPN created', 'data' => $npn], 201);
    }

    public function show(Npn $npn)
    {
        abort_unless(
            $this->currentUser()->canAccessDepotRow($npn->kode_depo, $npn->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );

        return response()->json(['data' => $npn]);
    }

    public function update(Request $request, Npn $npn)
    {
        abort_unless(
            $this->currentUser()->canAccessDepotRow($npn->kode_depo, $npn->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );

        $validated = $request->validate([
            'BOSnetszProductId' => 'nullable|string|max:20',
            'SAPszProductId' => 'nullable|string|max:20',
            'szNickName' => 'nullable|string|max:50',
            'szNickNameNew' => 'nullable|string|max:255',
            'szShortDescription' => 'nullable|string|max:255',
            'szLongDescription' => 'nullable|string|max:2000',
            'szCategory_1' => 'nullable|string|max:20',
            'szCat1Description' => 'nullable|string|max:100',
            'szCategory_2' => 'nullable|string|max:20',
            'szCat2Description' => 'nullable|string|max:100',
            'szCategory_3' => 'nullable|string|max:20',
            'szCat3Description' => 'nullable|string|max:100',
            'szCategory_4' => 'nullable|string|max:20',
            'szCat4Description' => 'nullable|string|max:100',
            'szCategory_5' => 'nullable|string|max:20',
            'szCat5Description' => 'nullable|string|max:100',
            'szCategory_6' => 'nullable|string|max:20',
            'szCat6Description' => 'nullable|string|max:100',
            'szCategory_7' => 'nullable|string|max:20',
            'szCat7Description' => 'nullable|string|max:100',
            'szCategory_8' => 'nullable|string|max:20',
            'szCat8Description' => 'nullable|string|max:100',
            'szCategory_9' => 'nullable|string|max:20',
            'szCat9Description' => 'nullable|string|max:100',
            'szCategory_10' => 'nullable|string|max:20',
            'szCat10Description' => 'nullable|string|max:100',
            'szCompUomId' => 'nullable|string|max:20',
            'szCompUomDesc' => 'nullable|string|max:50',
            'BOSnetszUomId' => 'nullable|string|max:20',
            'BOSnetdecUom' => 'nullable|string|max:50',
            'SAPszUomId' => 'nullable|string|max:20',
            'SAPdecUom' => 'nullable|string|max:50',
            'decUomConversion1' => 'nullable|numeric|min:0',
            'decUomConversion2' => 'nullable|numeric|min:0',
            'decWeight' => 'nullable|numeric|min:0',
            'decLength' => 'nullable|numeric|min:0',
            'decWidth' => 'nullable|numeric|min:0',
            'decHeight' => 'nullable|numeric|min:0',
            'decVolume' => 'nullable|numeric|min:0',
            'decStoreTemp' => 'nullable|string|max:20',
            'szBarcode' => 'nullable|string|max:20',
            'szBarcodeSekunder' => 'nullable|string|max:20',
            'szBarcodeTersier' => 'nullable|string|max:20',
            'szStatus' => 'nullable|string|max:10',
            'dtmValidEnd' => 'nullable|date',
            'SAPszSalesOrgId' => 'nullable|string|max:10',
            'szTaxTypeId' => 'nullable|string|max:10',
            'decRate' => 'nullable|numeric|min:0',
        ]);

        $npn->update($validated);

        return response()->json(['message' => 'NPN updated', 'data' => $npn]);
    }

    public function destroy(Npn $npn)
    {
        abort_unless(
            $this->currentUser()->canAccessDepotRow($npn->kode_depo, $npn->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );

        $npn->delete();

        return response()->json(['message' => 'NPN deleted']);
    }

    public function bulkDestroy(Request $request)
    {
        $request->validate([
            'ids' => 'required|array|max:500',
            'ids.*' => 'exists:npn,id',
        ]);

        $deleted = Npn::whereIn('id', $request->ids)->delete();

        return response()->json(['message' => 'Selected NPN deleted', 'deleted' => $deleted]);
    }

    public function import(Request $request)
    {
        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls,csv|max:10240',
        ]);

        try {
            $import = new NpnImport($request->user());
            DB::transaction(fn () => Excel::import($import, $request->file('file')));

            return response()->json([
                'message' => 'Import completed',
                'imported' => $import->imported,
                'updated' => $import->updated,
            ]);
        } catch (ValidationException $e) {
            $failures = $e->failures();
            Log::error('NPN Import Validation Error', ['failures' => $failures]);

            return response()->json([
                'message' => 'Import failed with validation errors',
                'errors' => collect($failures)->map(fn ($f) => [
                    'row' => $f->row(),
                    'attribute' => $f->attribute(),
                    'errors' => $f->errors(),
                ])->toArray(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('NPN Import Error', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);

            return response()->json([
                'message' => 'Import gagal. Silakan periksa file dan coba lagi.',
            ], 500);
        }
    }

    public function export(Request $request)
    {
        $filename = 'npn_products_'.date('Y-m-d_His').'.xlsx';

        $export = new NpnExport(
            search: $request->input('search'),
            szStatus: $request->input('szStatus'),
            sort: (string) $request->input('sort', 'szNickName'),
            direction: (string) $request->input('direction', 'asc'),
        );
        ExportGuard::ensureWithinLimit($export->query());

        return Excel::download(
            $export,
            $filename
        );
    }

    public function template()
    {
        return Excel::download(new NpnExport(empty: true), 'npn_template.xlsx');
    }

    public function searchProduct(Request $request)
    {
        $request->validate(['q' => 'required|string|min:1']);

        $term = '%'.$request->q.'%';
        $query = Npn::select('id', 'BOSnetszProductId', 'SAPszProductId', 'SAPszUomId', 'SAPdecUom', 'decVolume', 'szNickName', 'szNickNameNew', 'szShortDescription', 'decUomConversion1', 'BOSnetdecUom')
            // Ikut mencari szShortDescription/SAP ID/barcode karena itulah teks yang
            // benar-benar tampil pada picker, bukan hanya nickname produk.
            ->where(function ($q) use ($term) {
                $q->where('szNickName', 'like', $term)
                    ->orWhere('szNickNameNew', 'like', $term)
                    ->orWhere('szShortDescription', 'like', $term)
                    ->orWhere('BOSnetszProductId', 'like', $term)
                    ->orWhere('SAPszProductId', 'like', $term)
                    ->orWhere('szBarcode', 'like', $term)
                    ->orWhere('szBarcodeSekunder', 'like', $term)
                    ->orWhere('szBarcodeTersier', 'like', $term);
            })
            ->where('szStatus', 'EXISTING')
            ->orderBy('szNickName')
            ->limit(20)
            ->get();

        $materials = $query->pluck('SAPszProductId')->filter()->unique()->values();
        $umurs = StandarUmurProduk::whereIn('material', $materials)->pluck('umur', 'material');
        foreach ($query as $product) {
            $product->umur = $product->SAPszProductId ? ($umurs[$product->SAPszProductId] ?? null) : null;
            $product->decVolume = $product->decVolume !== null ? (float) $product->decVolume : null;
            $product->SAPdecUom = $product->SAPdecUom !== null ? (int) $product->SAPdecUom : null;
            $product->decUomConversion1 = $product->decUomConversion1 !== null ? (float) $product->decUomConversion1 : null;
            $product->BOSnetdecUom = $product->BOSnetdecUom !== null ? (float) $product->BOSnetdecUom : null;
        }

        return response()->json(['data' => $query]);
    }
}
