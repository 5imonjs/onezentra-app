<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\ClusterPrincipalExport;
use App\Http\Controllers\Controller;
use App\Imports\ClusterPrincipalImport;
use App\Models\ClusterPrincipal;
use App\Services\ExportGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Maatwebsite\Excel\Facades\Excel;

class ClusterPrincipalController extends Controller
{
    /** Kolom yang di-normalisasi sebelum disimpan (lihat `normalize()`). */
    private const COLUMNS = [
        'lob', 'product_category', 'sub_product_category', 'product_group',
        'product_class', 'product_sku', 'principal_1', 'principal_2',
    ];

    private const SORTABLE = [
        'lob', 'product_category', 'sub_product_category', 'product_group',
        'product_class', 'product_sku', 'principal_1', 'principal_2',
    ];

    /**
     * Aturan validasi kolom, dipakai bersama oleh store & update.
     *
     * Panjang maksimum longgar (255) mengikuti isi master produk: kategori sering
     * berupa kalimat panjang ("Flavored Milk Drink"), bukan kode pendek.
     */
    private function rules(Request $request, ?int $ignoreId = null): array
    {
        return [
            'lob' => 'nullable|string|max:255',
            'product_category' => 'nullable|string|max:255',
            'sub_product_category' => 'nullable|string|max:255',
            'product_group' => 'nullable|string|max:255',
            'product_class' => 'nullable|string|max:255',
            // SKU adalah kunci alami tabel, jadi wajib dan harus unik.
            'product_sku' => [
                'required', 'string', 'max:255',
                Rule::unique('cluster_principal', 'product_sku')->ignore($ignoreId),
            ],
            'principal_1' => 'nullable|string|max:255',
            'principal_2' => 'nullable|string|max:255',
        ];
    }

    /** Rapikan nilai sebelum disimpan: "#N/A" dari Excel menjadi null. */
    private function normalize(array $data): array
    {
        foreach (self::COLUMNS as $column) {
            if (array_key_exists($column, $data)) {
                $data[$column] = ClusterPrincipal::cleanValue($data[$column]);
            }
        }

        return $data;
    }

    public function index(Request $request): JsonResponse
    {
        $query = ClusterPrincipal::with('creator:id,full_name');

        if ($request->filled('search')) {
            $like = '%'.addcslashes($request->search, '\\%_').'%';
            $query->where(function ($q) use ($like) {
                $q->whereRaw('product_sku LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('principal_1 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('principal_2 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('lob LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('product_category LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('sub_product_category LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('product_group LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('product_class LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        if ($request->filled('lob')) {
            $query->where('lob', $request->lob);
        }

        if ($request->filled('principal')) {
            // Principal bisa muncul di kolom 1 maupun 2 — filter harus menjangkau
            // keduanya, kalau tidak produk yang principal-nya ada di kolom 2 akan
            // hilang dari hasil filter.
            $query->where(function ($q) use ($request) {
                $q->where('principal_1', $request->principal)
                    ->orWhere('principal_2', $request->principal);
            });
        }

        $sort = (string) $request->input('sort', 'product_sku');
        $direction = strtolower((string) $request->input('direction', 'asc')) === 'desc' ? 'desc' : 'asc';
        if (! in_array($sort, self::SORTABLE, true)) {
            $sort = 'product_sku';
            $direction = 'asc';
        }

        return response()->json($query->orderBy($sort, $direction)->paginate($this->perPage($request)));
    }

    /**
     * Nilai unik untuk dropdown filter LOB dan Principal.
     *
     * Diambil terpisah dari tabel utama supaya daftar filter tidak ikut ter-filter
     * pencarian — kalau ikut, pilihan yang tersedia ikut menyusut setiap kali
     * pengguna mengetik.
     */
    public function filters(Request $request): JsonResponse
    {
        $lob = ClusterPrincipal::query()
            ->whereNotNull('lob')
            ->distinct()
            ->orderBy('lob')
            ->pluck('lob');

        // Principal hidup di dua kolom, jadi daftar filter digabung keduanya —
        // SKU dengan principal hanya di kolom 2 tetap harus bisa difilter.
        $principal = ClusterPrincipal::query()->whereNotNull('principal_1')->pluck('principal_1')
            ->merge(ClusterPrincipal::query()->whereNotNull('principal_2')->pluck('principal_2'))
            ->unique()
            ->filter()
            ->sort()
            ->values();

        return response()->json(['data' => ['lob' => $lob, 'principal' => $principal]]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules($request));

        $row = ClusterPrincipal::create($this->normalize($validated) + ['created_by' => Auth::id()]);

        return response()->json(['message' => 'Data cluster/principal dibuat', 'data' => $row], 201);
    }

    public function show(ClusterPrincipal $clusterPrincipal): JsonResponse
    {
        return response()->json(['data' => $clusterPrincipal]);
    }

    public function update(Request $request, ClusterPrincipal $clusterPrincipal): JsonResponse
    {
        $validated = $request->validate($this->rules($request, $clusterPrincipal->id));

        $clusterPrincipal->update($this->normalize($validated));

        return response()->json(['message' => 'Data cluster/principal diperbarui', 'data' => $clusterPrincipal]);
    }

    public function destroy(ClusterPrincipal $clusterPrincipal): JsonResponse
    {
        $clusterPrincipal->delete();

        return response()->json(['message' => 'Data cluster/principal dihapus']);
    }

    public function bulkDestroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'required|integer|exists:cluster_principal,id',
        ]);

        $count = ClusterPrincipal::whereIn('id', $validated['ids'])->delete();

        return response()->json([
            'message' => $count.' data cluster/principal dihapus',
            'deleted' => $count,
        ]);
    }

    public function import(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|mimes:xlsx,xls,csv|max:10240',
        ]);

        $import = new ClusterPrincipalImport(Auth::user());

        try {
            DB::transaction(fn () => Excel::import($import, $request->file('file')));
        } catch (\Exception $e) {
            Log::error('ClusterPrincipal Import Error', ['error' => $e->getMessage()]);

            return response()->json([
                'message' => 'Import gagal. Silakan periksa format file dan coba lagi.',
            ], 500);
        }

        $message = "Import selesai: {$import->imported} baru, {$import->updated} diperbarui.";
        if ($import->skipped > 0) {
            // Diberi tahu eksplisit, bukan disembunyikan: baris yang hilang dari
            // import tapi owner unbekal akan dianggap sudah terbawa.
            $message .= " {$import->skipped} baris dilewati karena Product SKU kosong.";
        }

        return response()->json([
            'message' => $message,
            'imported' => $import->imported,
            'updated' => $import->updated,
            'skipped' => $import->skipped,
            'skipped_rows' => $import->skippedRows,
        ]);
    }

    public function export(Request $request)
    {
        $export = new ClusterPrincipalExport(
            search: $request->input('search'),
            lob: $request->input('lob'),
            principal: $request->input('principal'),
            sort: (string) $request->input('sort', 'product_sku'),
            direction: (string) $request->input('direction', 'asc'),
        );
        ExportGuard::ensureWithinLimit($export->query());

        return Excel::download($export, 'cluster_principal_'.date('Y-m-d_His').'.xlsx');
    }

    public function template()
    {
        return Excel::download(new ClusterPrincipalExport(empty: true), 'cluster_principal_template.xlsx');
    }
}
