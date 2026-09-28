<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\StandarUmurProdukExport;
use App\Exports\StandarUmurProdukTemplate;
use App\Http\Controllers\Controller;
use App\Imports\StandarUmurProdukImport;
use App\Models\StandarUmurProduk;
use App\Services\ExportGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Maatwebsite\Excel\Facades\Excel;

class StandarUmurProdukController extends Controller
{
    /**
     * Aturan validasi untuk seluruh 43 kolom form (create & update).
     *
     * @return array<string, string>
     */
    private function validationRules(): array
    {
        return [
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
            'conversion1' => 'nullable|string|max:255',
            'conversion2' => 'nullable|string|max:255',
            'min_doi' => 'nullable|integer|min:0',
            'target_doi' => 'nullable|integer|min:0',
            'max_doi' => 'nullable|integer|min:0',
            'trigger_point' => 'nullable|integer|min:0',
            'max_point' => 'nullable|integer|min:0',
            'supply_pattern' => 'nullable|string|max:255',
            'demand_pattern' => 'nullable|string|max:255',
            'skugrp' => 'nullable|string|max:255',
            'skuconv' => 'nullable|string|max:255',
            'umur' => 'nullable|integer|min:0',
            'vol_m3' => 'nullable|numeric|min:0',
            'weight_kg' => 'nullable|numeric|min:0',
            'metric_ton' => 'nullable|numeric|min:0',
            'type_sku' => 'nullable|string|max:255',
            'uom' => 'nullable|string|max:255',
            'allocation_start' => 'nullable|string|max:255',
            'allocation_end' => 'nullable|string|max:255',
            'uom2' => 'nullable|string|max:255',
            'sku_status' => 'nullable|string|max:255',
            'made_in' => 'nullable|string|max:255',
            'product_id' => 'nullable|string|max:255',
            'nickname' => 'nullable|string|max:255',
            'sku_fokus_nka' => 'nullable|string|max:255',
            'sku_fokus_mti' => 'nullable|string|max:255',
        ];
    }

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
        $sortable = ['material', 'material_description', 'brand', 'category', 'umur'];
        $sort = $request->input('sort', 'material_description');
        $direction = strtolower((string) $request->input('direction', 'asc')) === 'desc' ? 'desc' : 'asc';
        if (! in_array($sort, $sortable, true)) {
            $sort = 'material_description';
            $direction = 'asc';
        }
        $standarUmur = $query->orderBy($sort, $direction)->paginate($this->perPage($request, 50));

        return response()->json($standarUmur);
    }

    public function store(Request $request)
    {
        $validated = $request->validate($this->validationRules());

        $standarUmur = StandarUmurProduk::create($validated);

        return response()->json(['message' => 'Standar umur produk created', 'data' => $standarUmur], 201);
    }

    public function show(StandarUmurProduk $standarUmurProduk)
    {
        return response()->json(['data' => $standarUmurProduk]);
    }

    public function update(Request $request, StandarUmurProduk $standarUmurProduk)
    {
        $validated = $request->validate($this->validationRules());

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
        $export = new StandarUmurProdukExport(
            search: $request->input('search'),
            brand: $request->input('brand'),
            category: $request->input('category'),
            sort: (string) $request->input('sort', 'material_description'),
            direction: (string) $request->input('direction', 'asc'),
        );
        ExportGuard::ensureWithinLimit($export->query());

        return Excel::download($export, 'standar_umur_produk_'.now()->format('Y-m-d').'.xlsx');
    }

    public function template()
    {
        return Excel::download(new StandarUmurProdukTemplate, 'standar_umur_produk_template.xlsx');
    }

    public function import(Request $request)
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv|max:10240']);
        try {
            $import = new StandarUmurProdukImport;
            DB::transaction(fn () => Excel::import($import, $request->file('file')));

            return response()->json([
                'message' => 'Import berhasil',
                'data' => [
                    'total_rows' => $import->totalRows,
                    'imported' => $import->imported,
                    'skipped' => $import->skipped,
                ],
            ]);
        } catch (\Exception $e) {
            Log::error('Standar Umur Import Error', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Import gagal. Silakan periksa file dan coba lagi.'], 500);
        }
    }
}
