<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\StandarUmurProdukExport;
use App\Exports\StandarUmurProdukTemplate;
use App\Http\Controllers\Controller;
use App\Imports\StandarUmurProdukImport;
use App\Models\StandarUmurProduk;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;

class StandarUmurProdukController extends Controller
{
    public function index(Request $request)
    {
        $query = StandarUmurProduk::query();
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('material', 'like', '%'.$request->search.'%')
                    ->orWhere('material_description', 'like', '%'.$request->search.'%')
                    ->orWhere('product_id', 'like', '%'.$request->search.'%')
                    ->orWhere('nickname', 'like', '%'.$request->search.'%');
            });
        }
        if ($request->filled('brand')) {
            $query->where('brand', $request->brand);
        }
        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }
        $standarUmur = $query->orderBy('material_description')->paginate($this->perPage($request, 50));

        return response()->json($standarUmur);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'material' => 'nullable|string|max:255',
            'material_description' => 'nullable|string|max:255',
            'old_material_number' => 'nullable|string|max:255',
            'ext_material_group' => 'nullable|string|max:255',
            'country' => 'nullable|string|max:255',
            'principal' => 'nullable|string|max:255',
            'cluster' => 'nullable|string|max:255',
            'cluster2' => 'nullable|string|max:255',
            'lob' => 'nullable|string|max:255',
            'category' => 'nullable|string|max:255',
            'sub_category' => 'nullable|string|max:255',
            'brand' => 'nullable|string|max:255',
            'incubation' => 'nullable|string|max:255',
            'isi_sap' => 'nullable|string|max:255',
            'isi_bosnet' => 'nullable|string|max:255',
            'min_doi' => 'nullable|integer|min:0',
            'target_doi' => 'nullable|integer|min:0',
            'max_doi' => 'nullable|integer|min:0',
            'umur' => 'nullable|integer|min:0',
            'product_id' => 'nullable|string|max:255',
            'nickname' => 'nullable|string|max:255',
        ]);

        $standarUmur = StandarUmurProduk::create($validated);

        return response()->json(['message' => 'Standar umur produk created', 'data' => $standarUmur], 201);
    }

    public function show(StandarUmurProduk $standarUmurProduk)
    {
        return response()->json(['data' => $standarUmurProduk]);
    }

    public function update(Request $request, StandarUmurProduk $standarUmurProduk)
    {
        $validated = $request->validate([
            'material' => 'nullable|string|max:255',
            'material_description' => 'nullable|string|max:255',
            'brand' => 'nullable|string|max:255',
            'category' => 'nullable|string|max:255',
            'min_doi' => 'nullable|integer|min:0',
            'target_doi' => 'nullable|integer|min:0',
            'max_doi' => 'nullable|integer|min:0',
            'umur' => 'nullable|integer|min:0',
        ]);

        $standarUmurProduk->update($validated);

        return response()->json(['message' => 'Standar umur produk updated', 'data' => $standarUmurProduk]);
    }

    public function destroy(StandarUmurProduk $standarUmurProduk)
    {
        $standarUmurProduk->delete();

        return response()->json(['message' => 'Standar umur produk deleted']);
    }

    public function bulkDestroy(Request $request)
    {
        $request->validate([
            'ids' => 'required|array|max:500',
            'ids.*' => 'exists:standar_umur_produk,id',
        ]);
        $deleted = StandarUmurProduk::whereIn('id', $request->ids)->delete();

        return response()->json(['message' => 'Items deleted', 'deleted' => $deleted]);
    }

    public function export(Request $request)
    {
        $query = StandarUmurProduk::query();
        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->where('material', 'like', '%'.$request->search.'%')
                    ->orWhere('material_description', 'like', '%'.$request->search.'%');
            });
        }
        $data = $query->orderBy('material_description')->get();

        return Excel::download(new StandarUmurProdukExport($data), 'standar_umur_produk_'.now()->format('Y-m-d').'.xlsx');
    }

    public function template()
    {
        return Excel::download(new StandarUmurProdukTemplate, 'standar_umur_produk_template.xlsx');
    }

    public function import(Request $request)
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv']);
        try {
            $import = new StandarUmurProdukImport;
            Excel::import($import, $request->file('file'));

            return response()->json([
                'message' => 'Import berhasil',
                'data' => [
                    'total_rows' => $import->totalRows,
                    'imported' => $import->imported,
                    'skipped' => $import->skipped,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json(['message' => 'Import gagal. Silakan periksa file dan coba lagi.'], 500);
        }
    }
}
