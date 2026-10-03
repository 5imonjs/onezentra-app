<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\ReceivingExport;
use App\Exports\ReceivingTemplate;
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
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;

class ReceivingController extends Controller
{
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

        if ($request->search) {
            $query->whereHas('rencanaKirim', function ($q) use ($request) {
                $q->where('po_transporter', 'like', "%{$request->search}%")
                    ->orWhere('driver_name', 'like', "%{$request->search}%");
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
            $rencanaKirim = RencanaKirim::with('items')->forUserDepot($request->user())->findOrFail($validated['rencana_kirim_id']);

            abort_unless(
                $rencanaKirim->status === 'VERIFIED',
                422,
                "Receiving hanya dapat dibuat dari rencana berstatus VERIFIED (saat ini: {$rencanaKirim->status})."
            );

            abort_unless(
                ! Receiving::where('rencana_kirim_id', $rencanaKirim->id)
                    ->whereIn('status', ['PENDING', 'IN_PROGRESS'])
                    ->exists(),
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
        abort_unless(
            $this->currentUser()->canAccessDepotRow($rk?->kode_depo, $rk?->nama_depo),
            403,
            'Data receiving tidak ditemukan di depo Anda.'
        );
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
            $npn = Npn::query()
                ->where(fn ($q) => $q
                    ->where('BOSnetszProductId', $attributes['kode_barang'])
                    ->orWhere('SAPszProductId', $attributes['kode_barang'])
                    ->orWhere('szBarcode', $attributes['kode_barang']))
                ->first();

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
        $receiving->update([
            'status' => 'IN_PROGRESS',
            'actual_start_time' => now(),
        ]);

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

            if ($lockedReceiving->status === 'COMPLETED') {
                return 'completed';
            }

            if ($lockedReceiving->status === 'CANCELLED') {
                throw ValidationException::withMessages([
                    'status' => ['Receiving yang dibatalkan tidak dapat diselesaikan.'],
                ]);
            }

            $rencana = $lockedReceiving->rencanaKirim;
            $scan = trim($validated['barcode']);
            $match = $scan === $rencana->po_transporter;
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
        $this->emailService->send(
            'receiving',
            'completed',
            $receiving->rencanaKirim,
            new ReceivingCompleted($receiving)
        );

        return response()->json([
            'message' => $batchNumber === 'completed'
                ? 'Receiving already completed.'
                : 'Receiving completed.',
            'data' => $receiving->load('rencanaKirim'),
        ]);
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
            $receiving->update(['status' => 'CANCELLED']);

            if ($receiving->dock_id) {
                Dock::where('id', $receiving->dock_id)->update(['status' => 'AVAILABLE']);
            }

            $receiving->rencanaKirim->update(['status' => 'VERIFIED']);
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
            if ($receiving->dock_id) {
                Dock::where('id', $receiving->dock_id)->update(['status' => 'AVAILABLE']);
            }

            $receiving->items()->delete();
            $receiving->delete();

            $receiving->rencanaKirim->update(['status' => 'VERIFIED']);
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
            \Log::error('Receiving Import Error', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Import gagal. Silakan periksa file dan coba lagi.'], 500);
        }
    }

    public function export(Request $request)
    {
        $export = new ReceivingExport(
            search: $request->input('search'),
            status: $request->input('status'),
        );
        ExportGuard::ensureWithinLimit($export->query());

        return Excel::download($export, 'receivings_'.now()->format('Y-m-d').'.xlsx');
    }

    public function template()
    {
        return Excel::download(new ReceivingTemplate, 'receivings_template.xlsx');
    }
}
