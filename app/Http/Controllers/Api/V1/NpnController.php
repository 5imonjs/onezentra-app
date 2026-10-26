<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\NpnExport;
use App\Http\Controllers\Controller;
use App\Imports\NpnImport;
use App\Models\Npn;
use App\Models\StandarUmurProduk;
use App\Services\ExportGuard;
use App\Support\LikePattern;
use Illuminate\Http\JsonResponse;
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
            $like = LikePattern::contains($request->search);
            $query->where(function ($q) use ($like) {
                $q->whereRaw('szNickName LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szNickNameNew LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('BOSnetszProductId LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('SAPszProductId LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szShortDescription LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szBarcode LIKE ? ESCAPE ?', [$like, '\\'])
                    // Samakan dengan picker Rencana Kirim: nama panjang dan
                    // deskripsi kategori juga sering dipakai sebagai kata kunci.
                    ->orWhereRaw('szLongDescription LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat1Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat2Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat3Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat4Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat5Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat6Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat7Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat8Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat9Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat10Description LIKE ? ESCAPE ?', [$like, '\\']);
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
        $npn = $query->orderBy($sort, $direction)->orderBy('id')->paginate($this->perPage($request, 50));

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
        // Kunci depo untuk user scoped agar tidak bisa menyuntik baris ke depo lain.
        $validated = $this->currentUser()->depotAttributes($validated);
        $npn = Npn::create($validated);

        return response()->json(['message' => 'NPN created', 'data' => $npn], 201);
    }

    public function show(Npn $npn)
    {
        // NPN adalah master produk global: semua pemegang npn.view boleh
        // membaca detail lintas depo (sama dengan index/export/search-product).
        // Mutasi tetap dibatasi ke depo provenance lewat update/destroy agar
        // satu depo tidak mengubah baris milik depo lain.
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

        $user = $this->currentUser();
        // Samakan dengan destroy(): hanya baris yang boleh diakses user yang dihapus.
        $ids = Npn::whereIn('id', $request->ids)->get()
            ->filter(fn ($npn) => $user->canAccessDepotRow($npn->kode_depo, $npn->nama_depo))
            ->map(fn ($npn) => $npn->id)
            ->all();

        $deleted = empty($ids) ? 0 : Npn::whereIn('id', $ids)->delete();

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
            Log::error('NPN Import Error', ['error' => $e->getMessage()]);

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

    /**
     * Pencarian produk untuk picker "Nama Barang" (Rencana Kirim, Standarisasi,
     * Manual Batch). Mendukung paginasi: satu kata kunci umum bisa match lebih
     * dari satu halaman, jadi `limit` hanyalah UKURAN HALAMAN dan `total`/
     * `has_more` memberi tahu klien sisa datanya — "menampilkan X dari Y" lalu
     * tombol muat lanjut. Batas halaman dahulu memotong hasil secara diam-diam
     * (500 pertama urut szNickName), sehingga barang setelahnya tak pernah muncul.
     */
    public function searchProduct(Request $request): JsonResponse
    {
        // Trim di server agar spasi murni tidak jadi pencarian '% %'.
        $request->merge(['q' => trim((string) $request->input('q'))]);

        $validated = $request->validate([
            'q' => ['required', 'string', 'min:1'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:1000'],
            'offset' => ['sometimes', 'integer', 'min:0'],
        ]);

        $limit = (int) ($validated['limit'] ?? 500);
        $offset = (int) ($validated['offset'] ?? 0);

        $like = LikePattern::contains($validated['q']);
        $base = Npn::query()
            // Ikut mencari szShortDescription/SAP ID/barcode karena itulah teks yang
            // benar-benar tampil pada picker, bukan hanya nickname produk.
            ->where(function ($q) use ($like) {
                $q->whereRaw('szNickName LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szNickNameNew LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szShortDescription LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('BOSnetszProductId LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('SAPszProductId LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szBarcode LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szBarcodeSekunder LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szBarcodeTersier LIKE ? ESCAPE ?', [$like, '\\'])
                    // Nama panjang & deskripsi kategori sering jadi kata kunci user
                    // walau teks itu tidak pernah tampil di baris hasil.
                    ->orWhereRaw('szLongDescription LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat1Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat2Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat3Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat4Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat5Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat6Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat7Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat8Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat9Description LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('szCat10Description LIKE ? ESCAPE ?', [$like, '\\']);
            });

        $products = (clone $base)
            ->select('id', 'BOSnetszProductId', 'SAPszProductId', 'SAPszUomId', 'SAPdecUom', 'decVolume', 'szNickName', 'szNickNameNew', 'szShortDescription', 'decUomConversion1', 'BOSnetdecUom')
            ->orderBy('szNickName')
            ->orderBy('id')
            ->offset($offset)
            ->limit($limit)
            ->get();

        // COUNT hanya saat halaman penuh (kemungkinan masih ada sisa). Kalau
        // hasil kurang dari limit, halaman sudah mentok dan totalnya persis
        // offset + jumlah hasil — kebanyakan ketikan jadi tanpa query hitam penuh.
        $returned = $products->count();
        $total = $returned === $limit ? (clone $base)->count() : $offset + $returned;

        $materials = $products->pluck('SAPszProductId')->filter()->unique()->values();
        $umurs = StandarUmurProduk::whereIn('material', $materials)->pluck('umur', 'material');
        foreach ($products as $product) {
            $product->umur = $product->SAPszProductId ? ($umurs[$product->SAPszProductId] ?? null) : null;
            $product->decVolume = $product->decVolume !== null ? (float) $product->decVolume : null;
            $product->SAPdecUom = $product->SAPdecUom !== null ? (int) $product->SAPdecUom : null;
            $product->decUomConversion1 = $product->decUomConversion1 !== null ? (float) $product->decUomConversion1 : null;
            $product->BOSnetdecUom = $product->BOSnetdecUom !== null ? (float) $product->BOSnetdecUom : null;
        }

        return response()->json([
            'data' => $products,
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'has_more' => $offset + $returned < $total,
        ]);
    }
}
