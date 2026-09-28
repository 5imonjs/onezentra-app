<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\DockExport;
use App\Exports\DockTemplate;
use App\Http\Controllers\Controller;
use App\Imports\DockImport;
use App\Models\Dock;
use App\Services\ExportGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Maatwebsite\Excel\Facades\Excel;

class DockController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Dock::query();

        if ($request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->user()->kode_depo)
                ->where('nama_depo', $request->user()->nama_depo);
        }

        if ($request->status) {
            $query->where('status', $request->status);
        }

        $docks = $query->orderBy('name')->get();

        return response()->json(['data' => $docks]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:50|unique:docks',
            'code' => 'nullable|string|max:20',
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'capacity' => 'nullable|integer|min:0',
            'notes' => 'nullable|string|max:2000',
        ]);

        $validated['status'] = 'AVAILABLE';
        $validated = $request->user()->depotAttributes($validated);

        $dock = Dock::create($validated);

        return response()->json([
            'message' => 'Dock created successfully',
            'data' => $dock,
        ], 201);
    }

    public function show(Dock $dock): JsonResponse
    {
        abort_unless(
            $this->currentUser()->canAccessDepotRow($dock->kode_depo, $dock->nama_depo),
            403,
            'Dock tidak ditemukan di depo Anda.'
        );

        return response()->json(['data' => $dock]);
    }

    public function update(Request $request, Dock $dock): JsonResponse
    {
        abort_unless(
            $this->currentUser()->canAccessDepotRow($dock->kode_depo, $dock->nama_depo),
            403,
            'Dock tidak ditemukan di depo Anda.'
        );

        $validated = $request->validate([
            'name' => 'required|string|max:50|unique:docks,name,'.$dock->id,
            'code' => 'nullable|string|max:20',
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'status' => 'nullable|string|in:AVAILABLE,OCCUPIED,MAINTENANCE',
            'capacity' => 'nullable|integer|min:0',
            'notes' => 'nullable|string|max:2000',
        ]);

        $dock->update($request->user()->depotAttributes($validated));

        return response()->json([
            'message' => 'Dock updated successfully',
            'data' => $dock,
        ]);
    }

    public function destroy(Dock $dock): JsonResponse
    {
        abort_unless(
            $this->currentUser()->canAccessDepotRow($dock->kode_depo, $dock->nama_depo),
            403,
            'Dock tidak ditemukan di depo Anda.'
        );
        $dock->delete();

        return response()->json(['message' => 'Dock deleted successfully']);
    }

    public function import(Request $request)
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv|max:10240']);
        try {
            $import = new DockImport;
            DB::transaction(fn () => Excel::import($import, $request->file('file')));

            return response()->json([
                'message' => 'Import berhasil',
                'data' => ['imported' => $import->imported, 'updated' => $import->updated, 'errors' => $import->errors],
            ]);
        } catch (\Exception $e) {
            Log::error('Dock Import Error', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Import gagal. Silakan periksa file dan coba lagi.'], 500);
        }
    }

    public function export(Request $request)
    {
        $export = new DockExport(
            search: $request->input('search'),
            status: $request->input('status'),
        );
        ExportGuard::ensureWithinLimit($export->query());

        return Excel::download($export, 'docks_'.now()->format('Y-m-d').'.xlsx');
    }

    public function template()
    {
        return Excel::download(new DockTemplate, 'docks_template.xlsx');
    }
}
