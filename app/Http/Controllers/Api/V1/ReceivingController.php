<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\ReceivingExport;
use App\Exports\ReceivingTemplate;
use App\Http\Controllers\Concerns\AuthorizesDepotRow;
use App\Http\Controllers\Controller;
use App\Imports\ReceivingImport;
use App\Imports\ReceivingImportFailed;
use App\Mail\ReceivingCompleted;
use App\Models\Dock;
use App\Models\GateTransaction;
use App\Models\Npn;
use App\Models\Receiving;
use App\Models\ReceivingItem;
use App\Models\RencanaKirim;
use App\Models\RencanaKirimItem;
use App\Models\SjValidation;
use App\Services\EmailNotificationService;
use App\Services\ExportGuard;
use App\Support\LikePattern;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;

class ReceivingController extends Controller
{
    /** Memo lookup NPN per request: store/scan memanggil per baris. */
    private array $npnConversionCache = [];

    use AuthorizesDepotRow;

    public function __construct(private EmailNotificationService $emailService) {}

    public function index(Request $request): JsonResponse
    {
        $query = Receiving::with(['rencanaKirim', 'dock', 'gateTransaction']);

        if ($request->user()->isDepotScoped()) {
            $query->whereHas('rencanaKirim', fn ($q) => $q->forUserDepot($request->user()));
        }

        if ($request->status) {
            $query->where('status', $request->status);
        }

        // Filter depo untuk master (user global); user depot-scoped sudah
        // terkunci forUserDepot di atas sehingga filter asing diabaikan
        // (konsisten dengan semua laporan) — tetap depo sendiri.
        if ($request->filled('kode_depo') && ! $request->user()->isDepotScoped()) {
            $query->whereHas('rencanaKirim', fn ($q) => $q->where('kode_depo', $request->input('kode_depo')));
        }

        if ($request->search) {
            $like = LikePattern::contains($request->search);
            $query->whereHas('rencanaKirim', function ($q) use ($like) {
                $q->whereRaw('po_transporter LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('driver_name LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        $perPage = $this->perPage($request);
        $receivings = $query->orderBy('created_at', 'desc')->paginate($perPage);

        return response()->json($receivings);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'rencana_kirim_id' => 'required|exists:rencana_kirim,id',
            'dock_id' => 'nullable|exists:docks,id',
            'gate_transaction_id' => 'nullable|exists:gate_transactions,id',
            'notes' => 'nullable|string|max:2000',
        ]);

        if (! empty($validated['dock_id'])) {
            abort_unless(Dock::whereKey($validated['dock_id'])->exists(), 404, 'Dock tidak ditemukan.');
        }

        if (! empty($validated['gate_transaction_id'])) {
            abort_unless(
                GateTransaction::whereKey($validated['gate_transaction_id'])
                    ->where('rencana_kirim_id', $validated['rencana_kirim_id'])
                    ->exists(),
                422,
                'Transaksi gate tidak sesuai dengan rencana kirim.'
            );
        }

        $receiving = DB::transaction(function () use ($request, $validated) {
            $rencanaKirim = RencanaKirim::with('items')->forUserDepot($request->user())->lockForUpdate()->findOrFail($validated['rencana_kirim_id']);

            abort_unless(
                $rencanaKirim->status === 'VERIFIED',
                422,
                "Receiving hanya dapat dibuat dari rencana berstatus VERIFIED (saat ini: {$rencanaKirim->status})."
            );

            // GUARD: Cek existence DENGAN lockForUpdate di dalam transaction untuk mencegah
            // race condition: dua request concurrent bisa lewat cek -> exists() sebelum create.
            $existingReceiving = Receiving::where('rencana_kirim_id', $rencanaKirim->id)
                ->whereIn('status', ['PENDING', 'IN_PROGRESS'])
                ->lockForUpdate()
                ->first();

            abort_unless(
                ! $existingReceiving,
                422,
                'Rencana ini sudah memiliki receiving yang berjalan.'
            );

            if (! empty($validated['dock_id'])) {
                $dock = Dock::whereKey($validated['dock_id'])->lockForUpdate()->first();
                abort_unless(
                    $dock && $dock->kode_depo === $rencanaKirim->kode_depo && $dock->nama_depo === $rencanaKirim->nama_depo,
                    422,
                    'Dock tidak sesuai dengan depo rencana kirim.'
                );
                abort_unless($dock->status === 'AVAILABLE', 422, 'Dock sedang dipakai (OCCUPIED).');
                $dock->update(['status' => 'OCCUPIED']);
            }

            $receiving = Receiving::create([
                ...$validated,
                'total_expected_qty' => $rencanaKirim->items->sum('jumlah'),
                'total_received_qty' => $rencanaKirim->items->sum('jumlah'),
                'status' => 'PENDING',
                'checked_by' => $request->user()->id,
            ]);

            // Ambil data dari validasi SJ terakhir yang sudah COMPLETED
            $latestValidation = SjValidation::where('rencana_kirim_id', $rencanaKirim->id)
                ->where('status', 'COMPLETED')
                ->with('items')
                ->latest()
                ->first();

            if ($latestValidation && $latestValidation->items->count() > 0) {
                // Buat ReceivingItems dari data validasi (sudah ada actual_qty, condition, expired_date, barcode)
                foreach ($latestValidation->items as $svItem) {
                    ReceivingItem::create($this->withOpnameDefaults($receiving->id, $rencanaKirim, [
                        'receiving_id' => $receiving->id,
                        'sj_validation_item_id' => $svItem->id,
                        'rencana_kirim_item_id' => $svItem->rencana_kirim_item_id,
                        'kode_barang' => $svItem->kode_barang,
                        'nama_barang' => $svItem->nama_barang,
                        'expected_qty' => $svItem->expected_qty,
                        'actual_qty' => $svItem->actual_qty,
                        'satuan' => $svItem->satuan,
                        'condition' => ReceivingItem::normalizeCondition($svItem->condition) ?? ReceivingItem::CONDITIONS[0],
                        'expired_date' => $svItem->expired_date,
                        'barcode' => $svItem->barcode,
                    ]));
                }
            } else {
                // Fallback: tidak ada validasi, buat dari rencana_kirim_items
                foreach ($rencanaKirim->items as $ri) {
                    ReceivingItem::create($this->withOpnameDefaults($receiving->id, $rencanaKirim, [
                        'receiving_id' => $receiving->id,
                        'rencana_kirim_item_id' => $ri->id,
                        'kode_barang' => $ri->kode_barang,
                        'nama_barang' => $ri->nama_barang,
                        'expected_qty' => $ri->jumlah,
                        'actual_qty' => $ri->jumlah,
                        'satuan' => $ri->satuan,
                    ]));
                }
            }

            // Total header dihitung ulang dari baris yang benar-benar
            // tersalin: jalur penyalinan validasi memakai actual_qty (bisa
            // beda dari expected), jadi nilai awal dari rencana kirim tidak
            // boleh dipakai apa adanya — Quick Scan menampilkan angka ini
            // sebagai "diterima / diharapkan".
            $receiving->update([
                'total_received_qty' => $receiving->items()->sum('actual_qty'),
            ]);

            $rencanaKirim->update(['status' => 'IN_PROGRESS']);

            return $receiving;
        });

        return response()->json([
            'message' => 'Receiving created successfully',
            'data' => $receiving->load(['rencanaKirim', 'dock']),
        ], 201);
    }

    private function authorizeDepot(Receiving $receiving): void
    {
        $rk = $receiving->rencanaKirim;
        $this->authorizeDepotRow(
            $rk?->kode_depo,
            $rk?->nama_depo,
            'Data receiving tidak ditemukan di depo Anda.'
        );
    }

    /**
     * Hitung ulang `received_qty` tiap baris rencana kirim dari receiving
     * yang masih berlaku (bukan CANCELLED dan belum terhapus).
     *
     * `received_qty` di-increment per scan; tanpa penyetelan ulang saat
     * receiving dibatalkan/dihapus, angkanya membeku pada nilai scan yang
     * sudah batal dan receiving berikutnya double count.
     */
    private function refreshReceivedQty(RencanaKirim $rencanaKirim): void
    {
        $totals = ReceivingItem::query()
            ->join('receivings', 'receivings.id', '=', 'receiving_items.receiving_id')
            ->where('receivings.rencana_kirim_id', $rencanaKirim->id)
            ->where('receivings.status', '!=', 'CANCELLED')
            ->groupBy('receiving_items.rencana_kirim_item_id')
            ->selectRaw('receiving_items.rencana_kirim_item_id as item_id, SUM(receiving_items.actual_qty) as total')
            ->pluck('total', 'item_id');

        RencanaKirimItem::where('rencana_kirim_id', $rencanaKirim->id)
            ->get()
            ->each(function (RencanaKirimItem $item) use ($totals): void {
                $item->update(['received_qty' => $totals[$item->id] ?? 0]);
            });
    }

    /**
     * Isi kolom pendukung analisa opname expired untuk sebuah receiving item:
     * sumber material (shipper), depo, tanggal penerimaan, dan snapshot konversi
     * CRT/ZAK -> PCS dari master NPN.
     */
    private function withOpnameDefaults(int $receivingId, RencanaKirim $rencanaKirim, array $attributes): array
    {
        $attributes['source'] = ReceivingItem::SOURCE_VALIDASI;
        $attributes['sumber_material'] = $rencanaKirim->shipper_name;
        $attributes['kode_depo'] = $rencanaKirim->kode_depo;
        $attributes['nama_depo'] = $rencanaKirim->nama_depo;

        if (! isset($attributes['tanggal_penerimaan'])) {
            $attributes['tanggal_penerimaan'] = now()->toDateString();
        }

        if (isset($attributes['actual_qty']) && ! empty($attributes['kode_barang'])) {
            $cacheKey = $attributes['kode_barang'];
            if (! array_key_exists($cacheKey, $this->npnConversionCache)) {
                $this->npnConversionCache[$cacheKey] = Npn::query()
                    ->where(fn ($q) => $q
                        ->where('BOSnetszProductId', $attributes['kode_barang'])
                        ->orWhere('SAPszProductId', $attributes['kode_barang'])
                        ->orWhere('szBarcode', $attributes['kode_barang']))
                    ->first();
            }
            $npn = $this->npnConversionCache[$cacheKey];

            $conversion = $npn?->pcConversion();

            if ($npn && $conversion !== null) {
                $attributes['conversion_factor'] = $conversion;
                $attributes['qty_pcs'] = ((float) $attributes['actual_qty']) * $conversion;
            }
        }

        return $attributes;
    }

    public function show(Receiving $receiving): JsonResponse
    {
        $this->authorizeDepot($receiving);
        $receiving->load(['rencanaKirim.items', 'dock', 'gateTransaction', 'items']);

        return response()->json(['data' => $receiving]);
    }

    public function startReceiving(Receiving $receiving): JsonResponse
    {
        $this->authorizeDepot($receiving);
        abort_unless(
            $receiving->status === 'PENDING',
            422,
            "Receiving hanya dapat dimulai dari status PENDING (saat ini: {$receiving->status})."
        );

        $receiving = DB::transaction(function () use ($receiving): Receiving {
            // Kunci + cek ulang di dalam transaksi: complete/cancel bersamaan
            // tidak boleh menyalip start (pola yang sama dengan cancel/destroy).
            $locked = Receiving::whereKey($receiving->id)->lockForUpdate()->firstOrFail();
            abort_unless(
                $locked->status === 'PENDING',
                422,
                "Receiving hanya dapat dimulai dari status PENDING (saat ini: {$locked->status})."
            );
            $locked->update([
                'status' => 'IN_PROGRESS',
                'actual_start_time' => now(),
            ]);

            return $locked;
        });

        return response()->json([
            'message' => 'Receiving started',
            'data' => $receiving,
        ]);
    }

    public function scanItem(Request $request, Receiving $receiving): JsonResponse
    {
        $this->authorizeDepot($receiving);
        abort_unless(
            in_array($receiving->status, ['PENDING', 'IN_PROGRESS'], true),
            422,
            "Scan hanya dapat dilakukan saat receiving berjalan (saat ini: {$receiving->status})."
        );
        $validated = $request->validate([
            'barcode' => 'nullable|string|max:50',
            'kode_barang' => 'required|string|max:50',
            'nama_barang' => 'nullable|string|max:200',
            'actual_qty' => 'required|numeric|min:0|max:999999',
            'satuan' => 'nullable|string|max:20',
            'condition' => 'nullable|string|in:GOOD,DAMAGED,MISSING,FISIK_BAGUS,FISIK_RUSAK,QTY_KURANG,ISI_KEMASAN_KURANG,EXPIRED_TIDAK_STANDAR,LAINNYA',
            'notes' => 'nullable|string|max:2000',
            'rencana_kirim_item_id' => 'nullable|exists:rencana_kirim_items,id',
        ]);

        if (! empty($validated['rencana_kirim_item_id'])) {
            $rencanaKirimItem = RencanaKirimItem::whereKey($validated['rencana_kirim_item_id'])
                ->where('rencana_kirim_id', $receiving->rencana_kirim_id)
                ->first();

            if (! $rencanaKirimItem) {
                throw ValidationException::withMessages([
                    'rencana_kirim_item_id' => ['Item tidak termasuk dalam rencana kirim receiving ini.'],
                ]);
            }
        }

        $receivingItem = DB::transaction(function () use ($receiving, $validated) {
            $locked = Receiving::whereKey($receiving->id)->lockForUpdate()->firstOrFail();
            abort_unless(
                in_array($locked->status, ['PENDING', 'IN_PROGRESS'], true),
                422,
                'Receiving sudah selesai/dibatalkan.'
            );

            if (! isset($validated['rencana_kirim_item_id']) && ! empty($validated['kode_barang'])) {
                $match = RencanaKirimItem::where('rencana_kirim_id', $locked->rencana_kirim_id)
                    ->where('kode_barang', $validated['kode_barang'])
                    ->first();
                if ($match) {
                    $validated['rencana_kirim_item_id'] = $match->id;
                    $validated['nama_barang'] = $validated['nama_barang'] ?: $match->nama_barang;
                    $validated['satuan'] = $validated['satuan'] ?: $match->satuan;
                    $validated['expected_qty'] = $validated['expected_qty'] ?? $match->jumlah;
                }
            }

            $item = ReceivingItem::create($this->withOpnameDefaults($locked->id, $locked->rencanaKirim, [
                ...$validated,
                'condition' => ReceivingItem::normalizeCondition($validated['condition'] ?? null) ?? ReceivingItem::CONDITIONS[0],
                'receiving_id' => $locked->id,
                'scanned_by' => request()->user()->id,
                'scan_time' => now(),
            ]));

            if (! empty($validated['rencana_kirim_item_id'])) {
                RencanaKirimItem::where('id', $validated['rencana_kirim_item_id'])
                    ->increment('received_qty', $validated['actual_qty']);
            }

            $locked->update(['total_received_qty' => $locked->items()->sum('actual_qty')]);

            return $item;
        });

        return response()->json([
            'message' => 'Item scanned successfully',
            'data' => $receivingItem,
        ], 201);
    }

    public function completeReceiving(Request $request, Receiving $receiving): JsonResponse
    {
        $this->authorizeDepot($receiving);

        $validated = $request->validate([
            'barcode' => 'required|string|max:50',
        ]);

        $batchNumber = DB::transaction(function () use ($receiving, $validated): string {
            $lockedReceiving = Receiving::with(['items', 'rencanaKirim'])
                ->lockForUpdate()
                ->findOrFail($receiving->id);

            // VALIDASI: Semua item harus sudah di-scan (actual_qty terisi) dan memiliki condition
            $unscannedItems = $lockedReceiving->items()->whereNull('actual_qty')->count();
            $unconditionedItems = $lockedReceiving->items()->whereNull('condition')->count();
            abort_unless($unscannedItems === 0, 422, 'Masih ada item yang belum di-scan (actual_qty kosong).');
            abort_unless($unconditionedItems === 0, 422, 'Masih ada item tanpa kondisi (condition).');

            if ($lockedReceiving->status === 'COMPLETED') {
                return 'already_completed';
            }

            if ($lockedReceiving->status === 'CANCELLED') {
                throw ValidationException::withMessages([
                    'status' => ['Receiving yang dibatalkan tidak dapat diselesaikan.'],
                ]);
            }

            $rencana = $lockedReceiving->rencanaKirim;
            // Barcode cetak selalu UPPERCASE hasil sanitasi Code39
            // (sanitizeCode39Value), sementara PO di database bisa lowercase —
            // bandingkan case-insensitive supaya hasil scan selalu cocok.
            $scan = trim($validated['barcode']);
            $match = strtoupper($scan) === strtoupper(trim((string) $rencana->po_transporter));
            if (! $match) {
                throw ValidationException::withMessages([
                    'barcode' => ['Barcode tidak cocok dengan No. PO Transporter rencana kirim ini.'],
                ]);
            }

            $lockedReceiving->update([
                'status' => 'COMPLETED',
                'actual_end_time' => now(),
            ]);

            if ($lockedReceiving->dock_id) {
                Dock::whereKey($lockedReceiving->dock_id)->update(['status' => 'AVAILABLE']);
            }

            $lockedReceiving->rencanaKirim->update([
                'status' => 'COMPLETED',
                'completed_at' => now(),
            ]);

            return 'completed';
        });

        $receiving->refresh()->load(['items', 'rencanaKirim']);

        // Notifikasi hanya saat transaksi ini benar-benar menyelesaikan
        // receiving. Panggilan ulang (double-tap operator / retry jaringan)
        // tetap dijawab sukses karena idempoten — tapi tidak boleh
        // mengirim email "Receiving selesai" dua kali.
        if ($batchNumber === 'completed') {
            $this->emailService->send(
                'receiving',
                'completed',
                $receiving->rencanaKirim,
                new ReceivingCompleted($receiving),
                $receiving->rencanaKirim->kode_depo
            );
        }

        return response()->json([
            'message' => $batchNumber === 'completed'
                ? 'Receiving completed.'
                : 'Receiving already completed.',
            'data' => $receiving->load('rencanaKirim'),
        ]);
    }

    /**
     * Mundurkan RK ke VERIFIED hanya bila receiving yang dibatalkan/dihapus
     * adalah receiving aktif: status RK saat ini IN_PROGRESS/PENDING dan
     * tidak ada receiving COMPLETED lain untuk RK itu. Bila RK sudah
     * COMPLETED (ada receiving COMPLETED lain), biarkan tetap COMPLETED.
     */
    private function revertRencanaKirimToVerified(int $rencanaKirimId, int $exceptReceivingId): void
    {
        $rk = RencanaKirim::whereKey($rencanaKirimId)->lockForUpdate()->first();
        if (! $rk) {
            return;
        }
        if (! in_array($rk->status, ['IN_PROGRESS', 'PENDING'], true)) {
            return;
        }
        $hasOtherCompleted = Receiving::where('rencana_kirim_id', $rk->id)
            ->where('id', '!=', $exceptReceivingId)
            ->where('status', 'COMPLETED')
            ->exists();
        if ($hasOtherCompleted) {
            return;
        }
        $rk->update(['status' => 'VERIFIED']);
    }

    public function cancelReceiving(Receiving $receiving): JsonResponse
    {
        $this->authorizeDepot($receiving);
        abort_unless(
            in_array($receiving->status, ['PENDING', 'IN_PROGRESS'], true),
            422,
            "Receiving berstatus {$receiving->status} tidak dapat dibatalkan."
        );

        DB::transaction(function () use ($receiving) {
            // Kunci + cek ulang di dalam transaksi: complete() yang commit
            // bersamaan tidak boleh disalip cancel (begitu pula sebaliknya).
            $locked = Receiving::lockForUpdate()->findOrFail($receiving->id);
            abort_unless(
                in_array($locked->status, ['PENDING', 'IN_PROGRESS'], true),
                422,
                "Receiving berstatus {$locked->status} tidak dapat dibatalkan."
            );

            $locked->update(['status' => 'CANCELLED']);

            if ($locked->dock_id) {
                Dock::where('id', $locked->dock_id)->update(['status' => 'AVAILABLE']);
            }

            $this->revertRencanaKirimToVerified($locked->rencana_kirim_id, $locked->id);

            // Scan receiving ikut batal — received_qty dihitung ulang dari
            // receiving yang masih berlaku, supaya tidak membeku pada nilai
            // scan yang sudah dibatalkan.
            if ($locked->rencanaKirim) {
                $this->refreshReceivedQty($locked->rencanaKirim);
            }
        });

        return response()->json([
            'message' => 'Receiving cancelled',
            'data' => $receiving->refresh(),
        ]);
    }

    public function destroy(Receiving $receiving): JsonResponse
    {
        $this->authorizeDepot($receiving);
        abort_unless(
            $receiving->status !== 'COMPLETED',
            422,
            'Receiving yang sudah COMPLETED tidak dapat dihapus. Batalkan sebelum selesai bila memang salah input.'
        );

        DB::transaction(function () use ($receiving) {
            $locked = Receiving::lockForUpdate()->findOrFail($receiving->id);
            abort_unless(
                $locked->status !== 'COMPLETED',
                422,
                'Receiving yang sudah COMPLETED tidak dapat dihapus. Batalkan sebelum selesai bila memang salah input.'
            );

            if ($locked->dock_id) {
                Dock::where('id', $locked->dock_id)->update(['status' => 'AVAILABLE']);
            }

            $locked->items()->delete();
            $locked->delete();

            // Mundur satu langkah saja, jangan timpa buta: hanya RK yang
            // masih IN_PROGRESS/PENDING dan tanpa receiving COMPLETED lain
            // yang kembali VERIFIED; RK COMPLETED dibiarkan tetap COMPLETED.
            $this->revertRencanaKirimToVerified($locked->rencana_kirim_id, $locked->id);

            // Baris receiving_items sudah terhapus — received_qty dihitung
            // ulang supaya tidak menyisakan angka dari scan yang hilang.
            if ($locked->rencanaKirim) {
                $this->refreshReceivedQty($locked->rencanaKirim);
            }
        });

        return response()->json(['message' => 'Receiving deleted successfully']);
    }

    public function import(Request $request)
    {
        $request->validate(['file' => 'required|file|mimes:xlsx,xls,csv|max:10240']);

        $import = new ReceivingImport($request->user());

        try {
            // All-or-nothing: kalau ada satu baris tidak valid, seluruh import
            // di-rollback. Import sebagian menghasilkan data yang tidak lengkap
            // tanpa jejak jelas — lebih sulit ditelusuri daripada file yang
            // ditolak utuh dengan daftar baris bermasalah.
            DB::transaction(fn () => Excel::import($import, $request->file('file')));

            return response()->json([
                'message' => 'Import berhasil',
                'data' => ['imported' => $import->imported, 'updated' => $import->updated, 'errors' => []],
            ]);
        } catch (ReceivingImportFailed $e) {
            // 422: file-nya valid, isinya tidak. Error per baris dikembalikan
            // supaya user bisa memperbaiki file dan mencoba lagi.
            return response()->json([
                'message' => $e->getMessage(),
                'errors' => $e->rowErrors,
            ], 422);
        } catch (\Exception $e) {
            // 500: masalah sistem, bukan masalah file. Tidak ada detail internal
            // yang dikembalikan ke user — hanya dicatat di log.
            Log::error('Receiving Import Error', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Import gagal. Silakan periksa file dan coba lagi.'], 500);
        }
    }

    public function export(Request $request)
    {
        $export = new ReceivingExport(
            search: $request->input('search'),
            status: $request->input('status'),
            user: $request->user(),
            kodeDepo: $request->input('kode_depo'),
        );
        ExportGuard::ensureWithinLimit($export->query());

        return Excel::download($export, 'receivings_'.now()->format('Y-m-d').'.xlsx');
    }

    public function template()
    {
        return Excel::download(new ReceivingTemplate, 'receivings_template.xlsx');
    }
}
