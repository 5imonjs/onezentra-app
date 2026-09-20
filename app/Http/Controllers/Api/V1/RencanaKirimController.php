<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\RencanaKirimItemTemplate;
use App\Exports\RencanaKirimTemplate;
use App\Http\Controllers\Controller;
use App\Imports\RencanaKirimImport;
use App\Imports\RencanaKirimItemImport;
use App\Mail\RencanaKirimCreated;
use App\Models\Npn;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\StandarUmurProduk;
use App\Services\EmailNotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;

class RencanaKirimController extends Controller
{
    private const TRANSITIONS = [
        'DRAFT' => ['SCHEDULED', 'CANCELLED'],
        'SCHEDULED' => ['CHECKED_IN', 'CANCELLED'],
        'CHECKED_IN' => ['VERIFIED', 'CANCELLED'],
        'VERIFIED' => ['IN_PROGRESS', 'CANCELLED'],
        'IN_PROGRESS' => ['COMPLETED', 'CANCELLED'],
        'COMPLETED' => [],
        'CANCELLED' => [],
    ];

    public function __construct(private EmailNotificationService $emailService) {}

    /**
     * Lampirkan umur standar (bulan) pada setiap item rencana kirim, diambil dari
     * tabel standar_umur_produk melalui npn.SAPszProductId -> standar_umur_produk.material.
     */
    /**
     * @param  iterable<int, RencanaKirimItem>  $items
     */
    protected function attachStandarUmur(iterable $items): void
    {
        $items = collect($items);
        $materials = $items
            ->map(fn (RencanaKirimItem $it) => $it->npn?->SAPszProductId)
            ->filter()
            ->unique()
            ->values();

        $umurs = StandarUmurProduk::whereIn('material', $materials)
            ->pluck('umur', 'material');

        foreach ($items as $item) {
            /** @var RencanaKirimItem $item */
            $material = $item->npn?->SAPszProductId;
            $item->umur = $material ? ($umurs[$material] ?? null) : null;
        }
    }

    private function assertTransition(RencanaKirim $rencanaKirim, string $target): void
    {
        $allowed = self::TRANSITIONS[$rencanaKirim->status] ?? [];
        if (! in_array($target, $allowed, true)) {
            abort(422, "Transisi tidak valid: {$rencanaKirim->status} → {$target}");
        }
    }

    private function authorizeDepot(RencanaKirim $rencanaKirim): void
    {
        abort_unless(
            auth()->user()?->canAccessDepotRow($rencanaKirim->kode_depo, $rencanaKirim->nama_depo),
            403,
            'Rencana kirim tidak ditemukan di depo Anda.'
        );
    }

    public function index(Request $request): JsonResponse
    {
        $query = RencanaKirim::with(['items.npn', 'creator'])->forUserDepot($request->user());

        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('po_transporter', 'like', "%{$request->search}%")
                    ->orWhere('rkh_number', 'like', "%{$request->search}%")
                    ->orWhere('driver_name', 'like', "%{$request->search}%")
                    ->orWhere('nopol', 'like', "%{$request->search}%")
                    ->orWhere('destination_name', 'like', "%{$request->search}%");
            });
        }

        if ($request->status) {
            $query->where('status', $request->status);
        }

        if ($request->date_from) {
            $query->where('rkh_date', '>=', $request->date_from);
        }

        if ($request->date_to) {
            $query->where('rkh_date', '<=', $request->date_to);
        }

        $perPage = $this->perPage($request);
        $rencana_kirim = $query->orderBy('created_at', 'desc')->paginate($perPage);

        foreach ($rencana_kirim as $rencanaKirim) {
            $this->attachStandarUmur($rencanaKirim->items);
            $this->attachKubikasi($rencanaKirim->items);
            $rencanaKirim->total_kubikasi = $this->totalKubikasi($rencanaKirim->items);
        }

        return response()->json($rencana_kirim);
    }

    public function nextDockNumber(Request $request): JsonResponse
    {
        $max = (int) RencanaKirim::query()
            ->forUserDepot($request->user())
            ->whereNotNull('dock_number')
            ->where('dock_number', '!=', '')
            ->get('dock_number')
            ->map(fn ($s) => (int) preg_replace('/\D/', '', (string) $s->dock_number))
            ->max();

        return response()->json(['data' => str_pad((string) ($max + 1), 2, '0', STR_PAD_LEFT)]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'po_transporter' => 'required|string|max:100',
            'rkh_number' => 'nullable|string|max:50',
            'rkh_date' => 'nullable|date',
            'no_dokumen' => 'nullable|string|max:50',
            'no_dokumen_date' => 'nullable|string|max:50',
            'driver_name' => 'nullable|string|max:100',
            'nopol' => 'nullable|string|max:50',
            'jenis_kendaraan' => 'nullable|string|max:50',
            'expedisi' => 'nullable|string|max:100',
            'dock_number' => 'nullable|string|max:50',
            'shipper_name' => 'nullable|string|max:200',
            'shipper_address' => 'nullable|string',
            'shipper_phone' => 'nullable|string|max:50',
            'destination_name' => 'nullable|string|max:200',
            'destination_address' => 'nullable|string',
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
            'scheduled_at' => 'nullable|date',
            'items' => 'nullable|array',
            'items.*.item_number' => 'required_with:items|integer',
            'items.*.npn_id' => 'nullable|integer|exists:npn,id',
            'items.*.kode_barang' => 'nullable|string|max:50',
            'items.*.nama_barang' => 'required_with:items|string|max:200',
            'items.*.jumlah' => 'required_with:items|numeric|min:1',
            'items.*.satuan' => 'nullable|string|max:20',
            'items.*.keterangan' => 'nullable|string',
        ]);

        $validated['created_by'] = $request->user()->id;
        $validated['status'] = 'DRAFT';
        $validated['jenis_kendaraan'] ??= null;
        $validated = $request->user()->depotAttributes($validated);

        if (isset($validated['items'])) {
            $items = $this->normalizeItemsFromNpn($validated['items']);
            $this->assertItemsHaveProductCode($items);
            unset($validated['items']);
        }

        $rencanaKirim = RencanaKirim::create($validated);

        if (isset($items)) {
            $totalQty = 0;
            foreach ($items as $item) {
                $item['rencana_kirim_id'] = $rencanaKirim->id;
                RencanaKirimItem::create($item);
                $totalQty += $item['jumlah'];
            }
            $rencanaKirim->update(['total_qty' => $totalQty]);
        }

        $rencanaKirim->load('items.npn');
        $this->attachStandarUmur($rencanaKirim->items);
        $this->attachKubikasi($rencanaKirim->items);
        $rencanaKirim->total_kubikasi = $this->totalKubikasi($rencanaKirim->items);

        return response()->json([
            'message' => 'Rencana kirim berhasil dibuat',
            'data' => $rencanaKirim,
        ], 201);
    }

    public function show(RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);
        $rencanaKirim->load(['items.npn', 'gateTransactions', 'receivings.items.rencanaKirimItem.npn', 'creator']);
        $this->attachStandarUmur($rencanaKirim->items);
        $this->attachKubikasi($rencanaKirim->items);
        $rencanaKirim->total_kubikasi = $this->totalKubikasi($rencanaKirim->items);

        return response()->json(['data' => $rencanaKirim]);
    }

    public function update(Request $request, RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);
        $validated = $request->validate([
            'po_transporter' => 'sometimes|required|string|max:100',
            'rkh_number' => 'nullable|string|max:50',
            'rkh_date' => 'nullable|date',
            'no_dokumen' => 'nullable|string|max:50',
            'no_dokumen_date' => 'nullable|string|max:50',
            'driver_name' => 'nullable|string|max:100',
            'nopol' => 'nullable|string|max:50',
            'jenis_kendaraan' => 'nullable|string|max:50',
            'expedisi' => 'nullable|string|max:100',
            'dock_number' => 'nullable|string|max:50',
            'shipper_name' => 'nullable|string|max:200',
            'shipper_address' => 'nullable|string',
            'shipper_phone' => 'nullable|string|max:50',
            'destination_name' => 'nullable|string|max:200',
            'destination_address' => 'nullable|string',
            'kode_depo' => 'nullable|string|max:20',
            'nama_depo' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
            'scheduled_at' => 'nullable|date',
            'items' => 'nullable|array',
            'items.*.item_number' => 'required_with:items|integer',
            'items.*.npn_id' => 'nullable|integer|exists:npn,id',
            'items.*.kode_barang' => 'nullable|string|max:50',
            'items.*.nama_barang' => 'required_with:items|string|max:200',
            'items.*.jumlah' => 'required_with:items|numeric|min:1',
            'items.*.satuan' => 'nullable|string|max:20',
            'items.*.keterangan' => 'nullable|string',
        ]);

        if (isset($validated['items'])) {
            $items = $this->normalizeItemsFromNpn($validated['items']);
            $this->assertItemsHaveProductCode($items);
            unset($validated['items']);

            $rencanaKirim->items()->delete();
            $totalQty = 0;
            foreach ($items as $item) {
                $item['rencana_kirim_id'] = $rencanaKirim->id;
                RencanaKirimItem::create($item);
                $totalQty += $item['jumlah'];
            }
            $validated['total_qty'] = $totalQty;
        }

        $rencanaKirim->update($validated);

        $rencanaKirim->load('items.npn');
        $this->attachStandarUmur($rencanaKirim->items);
        $this->attachKubikasi($rencanaKirim->items);
        $rencanaKirim->total_kubikasi = $this->totalKubikasi($rencanaKirim->items);

        return response()->json([
            'message' => 'Rencana kirim berhasil diperbarui',
            'data' => $rencanaKirim,
        ]);
    }

    public function destroy(RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);
        $rencanaKirim->items()->delete();
        $rencanaKirim->delete();

        return response()->json(['message' => 'Rencana kirim berhasil dihapus']);
    }

    public function schedule(RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);
        $this->assertTransition($rencanaKirim, 'SCHEDULED');

        $rencanaKirim->update([
            'status' => 'SCHEDULED',
            'scheduled_at' => now(),
        ]);

        $this->emailService->send(
            'rencana_kirim',
            'created',
            $rencanaKirim,
            new RencanaKirimCreated($rencanaKirim->fresh(['items', 'creator']))
        );

        return response()->json([
            'message' => 'Rencana kirim berhasil dijadwalkan',
            'data' => $rencanaKirim,
        ]);
    }

    public function verify(RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);
        $this->assertTransition($rencanaKirim, 'VERIFIED');

        $rencanaKirim->update([
            'status' => 'VERIFIED',
            'verified_at' => now(),
        ]);

        return response()->json([
            'message' => 'Rencana kirim berhasil diverifikasi',
            'data' => $rencanaKirim,
        ]);
    }

    private function normalizeItemsFromNpn(array $items): array
    {
        return array_map(function (array $item): array {
            $product = ! empty($item['npn_id'])
                ? Npn::find($item['npn_id'])
                : Npn::query()
                    ->where(function ($query) use ($item) {
                        $query->where('szNickName', $item['nama_barang'] ?? '')
                            ->orWhere('szNickNameNew', $item['nama_barang'] ?? '');
                    })
                    ->first();

            if ($product) {
                $item['npn_id'] = $product->id;
                $item['kode_barang'] = $product->BOSnetszProductId;
            }

            return $item;
        }, $items);
    }

    private function assertItemsHaveProductCode(array $items): void
    {
        if (collect($items)->contains(fn (array $item): bool => blank($item['kode_barang'] ?? null))) {
            throw ValidationException::withMessages([
                'items' => ['Setiap barang harus ditemukan di NPN dan memiliki Kode Barang.'],
            ]);
        }
    }

    public function cancel(RencanaKirim $rencanaKirim): JsonResponse
    {
        $this->authorizeDepot($rencanaKirim);
        $this->assertTransition($rencanaKirim, 'CANCELLED');

        $rencanaKirim->update(['status' => 'CANCELLED']);

        return response()->json([
            'message' => 'Rencana kirim berhasil dibatalkan',
            'data' => $rencanaKirim,
        ]);
    }

    /**
     * Hitung total kubikasi (m3) dari kumpulan item. Kubikasi bukan kolom DB —
     * ia atribut transient (volume x qty) yang dihitung dari data NPN.
     *
     * @param  iterable<int, RencanaKirimItem>  $items
     */
    private function totalKubikasi(iterable $items): float
    {
        $sum = 0.0;
        foreach ($items as $item) {
            $sum += (float) ($item->kubikasi ?? 0);
        }

        return $sum;
    }

    /**
     * Lampirkan kubikasi transient pada setiap item rencana kirim:
     * jumlah x decVolume x SAPdecUom / 1.000.000 (m3).
     *
     * @param  iterable<int, RencanaKirimItem>  $items
     */
    protected function attachKubikasi(iterable $items): void
    {
        foreach ($items as $item) {
            /** @var RencanaKirimItem $item */
            $volume = $item->npn?->decVolume;
            $uom = $item->npn?->SAPdecUom;
            $item->kubikasi = ($volume !== null && $uom !== null)
                ? round(((float) $item->jumlah) * ((float) $volume) * ((float) $uom) / 1_000_000, 4)
                : null;
        }
    }

    /**
     * Statistik global rencana kirim: hitungan per status, total, dan
     * agregat kalender (rkh_date x status) untuk dashboard halaman.
     */
    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();
        $rks = RencanaKirim::with('items.npn')->forUserDepot($user)->get();

        $statuses = ['DRAFT', 'SCHEDULED', 'CHECKED_IN', 'VERIFIED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
        $stats = [];
        foreach ($statuses as $status) {
            $group = $rks->where('status', $status);
            $stats[$status] = [
                'count' => $group->count(),
                'sum_qty' => (int) $group->sum('total_qty'),
                'sum_kubikasi' => round($group->sum(fn (RencanaKirim $rk) => $this->totalKubikasi($rk->items)), 2),
            ];
        }

        $today = now()->toDateString();

        $calendar = $rks
            ->groupBy(fn (RencanaKirim $rk) => $rk->rkh_date?->toDateString())
            ->map(function ($group, $date) use ($statuses) {
                $breakdown = [];
                foreach ($statuses as $status) {
                    $count = $group->where('status', $status)->count();
                    if ($count > 0) {
                        $breakdown[$status] = $count;
                    }
                }

                return ['date' => $date, 'count' => $group->count(), 'breakdown' => $breakdown];
            })
            ->sortByDesc('date')
            ->values()
            ->all();

        return response()->json([
            'data' => $stats,
            'total' => $rks->count(),
            'total_qty' => (int) $rks->sum('total_qty'),
            'total_kubikasi' => round($rks->sum(fn (RencanaKirim $rk) => $this->totalKubikasi($rk->items)), 2),
            'today_count' => $rks->filter(fn (RencanaKirim $rk) => $rk->rkh_date?->toDateString() === $today)->count(),
            'calendar' => $calendar,
        ]);
    }

    public function template()
    {
        return Excel::download(new RencanaKirimTemplate, 'rencana_kirim_template.xlsx');
    }

    public function import(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv']);

        try {
            $import = new RencanaKirimImport($request->user());
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

    public function itemTemplate()
    {
        return Excel::download(new RencanaKirimItemTemplate, 'rencana_kirim_item_template.xlsx');
    }

    /**
     * Import item dari Excel untuk form create/edit rencana kirim — mengembalikan
     * daftar item hasil resolusi NPN (tanpa menyimpan ke DB).
     */
    public function importItems(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv']);

        try {
            $import = new RencanaKirimItemImport;
            Excel::import($import, $request->file('file'));
        } catch (\Exception $e) {
            return response()->json(['message' => 'Import gagal. Silakan periksa file dan coba lagi.'], 500);
        }

        return response()->json([
            'message' => $import->matched > 0 ? 'Import berhasil' : 'Tidak ada barang yang cocok',
            'data' => [
                'total_rows' => $import->totalRows,
                'matched' => $import->matched,
                'skipped' => $import->skipped,
                'items' => $import->items,
            ],
        ]);
    }
}
