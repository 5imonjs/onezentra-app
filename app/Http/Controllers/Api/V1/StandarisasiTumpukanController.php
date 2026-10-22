<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\StandarisasiTumpukanExport;
use App\Exports\StandarisasiTumpukanTemplate;
use App\Http\Controllers\Controller;
use App\Imports\StandarisasiTumpukanImport;
use App\Mail\StandarisasiStatusNotification;
use App\Models\Npn;
use App\Models\StandarisasiTumpukan;
use App\Models\User;
use App\Services\EmailNotificationService;
use App\Services\ExportGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Maatwebsite\Excel\Facades\Excel;

class StandarisasiTumpukanController extends Controller
{
    /** Batas atas tier/tinggi tumpukan — disamakan dengan clamp pada form UI. */
    private const MAX_DIMENSION = 100;

    /** Kolom produk yang ikut dicari (termasuk szShortDescription yang tampil di tabel). */
    private const NPN_SEARCH_COLUMNS = [
        'szNickName',
        'szNickNameNew',
        'szShortDescription',
        'BOSnetszProductId',
        'SAPszProductId',
        'szBarcode',
        'szBarcodeSekunder',
        'szBarcodeTersier',
    ];

    private const NPN_LIST_COLUMNS = 'id,BOSnetszProductId,SAPszProductId,szNickName,szNickNameNew,szShortDescription,szBarcode,szBarcodeSekunder,szBarcodeTersier';

    public function __construct(private EmailNotificationService $emailService) {}

    public function index(Request $request): JsonResponse
    {
        $standarisasi = $this->filteredQuery($request)
            ->with('npn:'.self::NPN_LIST_COLUMNS)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate($this->perPage($request));

        return response()->json($standarisasi);
    }

    /**
     * Ringkasan jumlah per status untuk kartu dashboard.
     *
     * Dihitung terpisah dari daftar agar angkanya mencakup seluruh depo user,
     * bukan hanya baris di halaman yang sedang dibuka.
     */
    public function stats(Request $request): JsonResponse
    {
        $counts = $this->filteredQuery($request, withSearch: false)
            ->selectRaw('status, count(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status');

        return response()->json([
            'data' => [
                'total' => (int) $counts->sum(),
                'pending' => (int) $counts->get('pending', 0),
                'approved' => (int) $counts->get('approved', 0),
                'rejected' => (int) $counts->get('rejected', 0),
            ],
        ]);
    }

    /**
     * Pencarian produk untuk picker pada form standarisasi.
     *
     * Terpisah dari NpnController@searchProduct agar halaman ini tidak bergantung
     * pada permission `npn.view`, dan hanya mengembalikan kolom yang dipakai picker.
     */
    public function searchProduct(Request $request): JsonResponse
    {
        $validated = $request->validate(['q' => 'required|string|min:1']);
        $like = $this->likeContains($validated['q']);

        $products = Npn::query()
            ->select(['id', 'BOSnetszProductId', 'SAPszProductId', 'szNickName', 'szNickNameNew', 'szShortDescription', 'szBarcode'])
            ->where(function ($query) use ($like) {
                foreach (self::NPN_SEARCH_COLUMNS as $index => $column) {
                    $index === 0
                        ? $query->whereRaw("{$column} LIKE ? ESCAPE ?", [$like, '\\'])
                        : $query->orWhereRaw("{$column} LIKE ? ESCAPE ?", [$like, '\\']);
                }
            })
            ->orderBy('szNickName')
            ->limit(500)
            ->get();

        return response()->json(['data' => $products]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'npn_id' => 'required|integer|exists:npn,id',
            'tier' => 'required|integer|min:1|max:'.self::MAX_DIMENSION,
            'tinggi_tumpukan' => 'required|integer|min:1|max:'.self::MAX_DIMENSION,
            'kode_depo' => 'nullable|string|max:50',
            'nama_depo' => 'nullable|string|max:150',
        ]);

        // Cek duplikasi: hindari request standarisasi ganda dengan npn_id yang sama dan status pending
        $existing = StandarisasiTumpukan::where('npn_id', $validated['npn_id'])
            ->where('status', 'pending')
            ->first();

        if ($existing) {
            return response()->json([
                'message' => 'Standarisasi tumpukan already exists for this product. Please update the existing request or wait for approval.',
            ], 422);
        }

        $validated['requested_by'] = $request->user()->id;
        $validated['requested_by_email'] = $request->user()->email;
        $validated['status'] = 'pending';
        $validated = $request->user()->depotAttributes($validated);

        $validated['total_tier_tinggi'] = $validated['tier'] * $validated['tinggi_tumpukan'];

        $standarisasi = StandarisasiTumpukan::create($validated)->load('npn');

        $this->sendNotification($standarisasi, 'submitted');

        return response()->json(['message' => 'Standarisasi tumpukan created', 'data' => $standarisasi], 201);
    }

    public function show(Request $request, StandarisasiTumpukan $standarisasiTumpukan): JsonResponse
    {
        $this->authorizeDepot($request, $standarisasiTumpukan);

        return response()->json(['data' => $standarisasiTumpukan->load('npn')]);
    }

    /**
     * Ubah isi standarisasi (produk, tier, tinggi).
     *
     * `status` sengaja tidak divalidasi di sini: satu-satunya jalur perubahan
     * status adalah approve()/reject() yang dijaga permission standarisasi.approve.
     * Bila baris yang sudah approved diubah isinya, approval lama dibatalkan dan
     * baris kembali ke `pending` agar wajib disetujui ulang.
     */
    public function update(Request $request, StandarisasiTumpukan $standarisasiTumpukan): JsonResponse
    {
        $this->authorizeDepot($request, $standarisasiTumpukan);

        $validated = $request->validate([
            'npn_id' => 'nullable|integer|exists:npn,id',
            'tier' => 'nullable|integer|min:1|max:'.self::MAX_DIMENSION,
            'tinggi_tumpukan' => 'nullable|integer|min:1|max:'.self::MAX_DIMENSION,
        ]);

        $contentChanged = collect(array_keys($validated))
            ->contains(fn (string $field) => (string) ($validated[$field] ?? '') !== (string) ($standarisasiTumpukan->{$field} ?? ''));

        if ($contentChanged) {
            $tier = $validated['tier'] ?? $standarisasiTumpukan->tier;
            $tinggi = $validated['tinggi_tumpukan'] ?? $standarisasiTumpukan->tinggi_tumpukan;
            $validated['total_tier_tinggi'] = ($tier ?? 0) * ($tinggi ?? 0);
        }

        $requiresReapproval = $contentChanged && $standarisasiTumpukan->status === 'approved';
        if ($requiresReapproval) {
            $validated['status'] = 'pending';
            $validated['approved_by'] = null;
            $validated['approved_by_email'] = null;
        }

        $standarisasiTumpukan->update($validated);
        $standarisasiTumpukan = $standarisasiTumpukan->refresh()->load('npn');

        if ($requiresReapproval) {
            $this->sendNotification($standarisasiTumpukan, 'submitted');
        }

        return response()->json([
            'message' => $requiresReapproval
                ? 'Standarisasi tumpukan diperbarui dan menunggu approval ulang'
                : 'Standarisasi tumpukan updated',
            'data' => $standarisasiTumpukan,
            'requires_reapproval' => $requiresReapproval,
        ]);
    }

    public function approve(Request $request, StandarisasiTumpukan $standarisasiTumpukan): JsonResponse
    {
        $this->authorizeDepot($request, $standarisasiTumpukan);

        $standarisasiTumpukan->update([
            'status' => 'approved',
            'approved_by' => $request->user()->id,
            'approved_by_email' => $request->user()->email,
            'total_tier_tinggi' => ($standarisasiTumpukan->tier ?? 0) * ($standarisasiTumpukan->tinggi_tumpukan ?? 0),
        ]);

        $standarisasiTumpukan = $standarisasiTumpukan->refresh()->load('npn');
        $this->sendNotification($standarisasiTumpukan, 'approved');

        return response()->json(['message' => 'Standarisasi tumpukan disetujui', 'data' => $standarisasiTumpukan]);
    }

    public function reject(Request $request, StandarisasiTumpukan $standarisasiTumpukan): JsonResponse
    {
        $this->authorizeDepot($request, $standarisasiTumpukan);

        $standarisasiTumpukan->update(['status' => 'rejected']);

        $standarisasiTumpukan = $standarisasiTumpukan->refresh()->load('npn');
        $this->sendNotification($standarisasiTumpukan, 'rejected');

        return response()->json(['message' => 'Standarisasi tumpukan ditolak', 'data' => $standarisasiTumpukan]);
    }

    /**
     * Kirim ulang notifikasi email untuk status baris saat ini.
     */
    public function notify(Request $request, StandarisasiTumpukan $standarisasiTumpukan): JsonResponse
    {
        $this->authorizeDepot($request, $standarisasiTumpukan);

        $trigger = match ($standarisasiTumpukan->status) {
            'approved' => 'approved',
            'rejected' => 'rejected',
            default => 'submitted',
        };

        $this->sendNotification($standarisasiTumpukan->load('npn'), $trigger);

        return response()->json(['message' => 'Notifikasi email dikirim ulang ke BLC & Admin Distribusi.']);
    }

    public function destroy(Request $request, StandarisasiTumpukan $standarisasiTumpukan): JsonResponse
    {
        $this->authorizeDepot($request, $standarisasiTumpukan);
        $standarisasiTumpukan->delete();

        return response()->json(['message' => 'Standarisasi tumpukan deleted']);
    }

    /**
     * Hapus banyak baris dalam satu permintaan.
     *
     * Otorisasi per baris disamakan dengan destroy() supaya user tidak dapat
     * menghapus data depo lain hanya dengan menebak id.
     */
    public function bulkDestroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => 'required|array|max:500',
            'ids.*' => 'integer',
        ]);

        $user = $request->user();
        $allowedIds = StandarisasiTumpukan::whereIn('id', $validated['ids'])
            ->get()
            ->filter(fn (StandarisasiTumpukan $row) => $this->canManageRow($user, $row))
            ->pluck('id');

        $deleted = $allowedIds->isEmpty()
            ? 0
            : StandarisasiTumpukan::whereIn('id', $allowedIds)->delete();

        return response()->json([
            'message' => 'Standarisasi tumpukan terpilih dihapus',
            'deleted' => $deleted,
            'skipped' => count($validated['ids']) - $deleted,
        ]);
    }

    private function filteredQuery(Request $request, bool $withSearch = true)
    {
        $query = StandarisasiTumpukan::query();
        if (! $request->user()->hasPermission('standarisasi.view_all')) {
            $query->forUserDepot($request->user());
        }

        if ($withSearch && $request->filled('search')) {
            $like = $this->likeContains((string) $request->search);
            $query->where(function ($q) use ($like) {
                $q->whereHas('npn', function ($npn) use ($like) {
                    foreach (self::NPN_SEARCH_COLUMNS as $index => $column) {
                        $index === 0
                            ? $npn->whereRaw("{$column} LIKE ? ESCAPE ?", [$like, '\\'])
                            : $npn->orWhereRaw("{$column} LIKE ? ESCAPE ?", [$like, '\\']);
                    }
                })->orWhereRaw('kode_depo LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('nama_depo LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        if ($request->filled('kode_depo')) {
            $query->where('kode_depo', $request->kode_depo);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return $query;
    }

    /**
     * Siapa yang boleh melewati scoping depo ditentukan oleh permission
     * `standarisasi.view_all` (lintas depo khusus modul ini) atau
     * `depot.view_all` (lintas depo global, lewat canAccessDepotRow) —
     * bukan daftar slug di sini.
     *
     * Daftar lama `['blc', 'staff_logistic']` ditulis langsung di source,
     * sehingga user yang secara formal TIDAK punya bypass tetap bisa
     * menyentuh baris depo lain — permission bukan lagi sumber kebenaran
     * dan selisihnya tidak terlihat dari mana pun kecuali membaca
     * controller ini. Peran yang benar-benar lintas depo sekarang
     * ditentukan di PermissionSeeder, sama seperti modul lain.
     *
     * `isAdminMaster()` tetap diperiksa eksplisit karena peran itu punya
     * jalur admin tersendiri di luar permission.
     */
    private function canManageRow(User $user, StandarisasiTumpukan $row): bool
    {
        if ($user->isAdminMaster() || $user->hasPermission('standarisasi.view_all')) {
            return true;
        }

        return $user->canAccessDepotRow($row->kode_depo, $row->nama_depo);
    }

    private function authorizeDepot(Request $request, StandarisasiTumpukan $standarisasiTumpukan): void
    {
        abort_unless(
            $this->canManageRow($request->user(), $standarisasiTumpukan),
            403,
            'Data standarisasi tidak ditemukan di depo Anda.'
        );
    }

    private function sendNotification(StandarisasiTumpukan $standarisasi, string $trigger): void
    {
        $this->emailService->send(
            'standarisasi_tumpukan',
            $trigger,
            $standarisasi,
            new StandarisasiStatusNotification($standarisasi),
            $standarisasi->kode_depo
        );
    }

    public function import(Request $request)
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv|max:10240']);
        try {
            $import = new StandarisasiTumpukanImport($request->user());
            DB::transaction(fn () => Excel::import($import, $request->file('file')));

            return response()->json([
                'message' => 'Import berhasil',
                'data' => ['imported' => $import->imported, 'updated' => $import->updated, 'errors' => $import->errors],
            ]);
        } catch (\Exception $e) {
            Log::error('Standarisasi Import Error', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Import gagal. Silakan periksa file dan coba lagi.'], 500);
        }
    }

    public function export(Request $request)
    {
        $export = new StandarisasiTumpukanExport(
            search: $request->input('search'),
            status: $request->input('status'),
            user: $request->user(),
            kodeDepo: $request->input('kode_depo'),
        );
        ExportGuard::ensureWithinLimit($export->query());

        return Excel::download($export, 'standarisasi-tumpukan_'.now()->format('Y-m-d').'.xlsx');
    }

    public function template()
    {
        return Excel::download(new StandarisasiTumpukanTemplate, 'standarisasi-tumpukan_template.xlsx');
    }
}
