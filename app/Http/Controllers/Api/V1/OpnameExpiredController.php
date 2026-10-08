<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\OpnameExpiredExport;
use App\Http\Controllers\Controller;
use App\Mail\OpnameExpiredNotification;
use App\Models\OpnameExpiredSession;
use App\Models\OpnameExpiredWave;
use App\Models\OpnameSetting;
use App\Services\EmailNotificationService;
use App\Services\ExportGuard;
use App\Services\OpnameExpiredService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Maatwebsite\Excel\Facades\Excel;

class OpnameExpiredController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        // Principal 1 & 2 dari master cluster_principal: BOSnet stabil dulu,
        // nickname lama/baru via NPN, product_sku langsung sebagai jaring
        // terakhir. Semua LEFT: wave tetap muncul walau master belum lengkap.
        //
        // Anti-duplikasi: product_sku unik di master, TAPI bosnetsz_product_id
        // tidak (data kotor: 1 BOS bisa menunjuk 2 baris dengan principal
        // berbeda). Tanpa dedup, 1 baris wave mengganda di tabel + merusak
        // hitungan paginasi. Ambil deterministik baris pertama (MIN id);
        // konflik isi master WAJIB dibersihkan di data, bukan di join.
        $cpDedup = DB::table('cluster_principal')
            ->selectRaw('bosnetsz_product_id, MIN(id) as id')
            ->whereNotNull('bosnetsz_product_id')
            ->groupBy('bosnetsz_product_id');

        $query = OpnameExpiredWave::with('validator')
            ->select('opname_expired_waves.*')
            ->addSelect(DB::raw('COALESCE(cp.principal_1, cp_nick.principal_1, cp_sku.principal_1) as principal_1'))
            ->addSelect(DB::raw('COALESCE(cp.principal_2, cp_nick.principal_2, cp_sku.principal_2) as principal_2'))
            ->leftJoin('npn', 'npn.BOSnetszProductId', '=', 'opname_expired_waves.kode_barang')
            ->leftJoinSub($cpDedup, 'cp_ids', 'cp_ids.bosnetsz_product_id', '=', 'opname_expired_waves.kode_barang')
            ->leftJoin('cluster_principal as cp', 'cp.id', '=', 'cp_ids.id')
            ->leftJoin('cluster_principal as cp_nick', function ($join): void {
                // Nama lama DAN nama baru: gramatik boleh berubah, ID stabil tetap.
                $join->on('cp_nick.product_sku', '=', 'npn.szNickName')
                    ->orOn('cp_nick.product_sku', '=', 'npn.szNickNameNew');
            })
            ->leftJoin('cluster_principal as cp_sku', 'cp_sku.product_sku', '=', 'opname_expired_waves.kode_barang');

        if ($request->user()->isDepotScoped()) {
            $query->where('opname_expired_waves.kode_depo', $request->user()->kode_depo);
        }

        if ($request->week_start) {
            $query->where('opname_expired_waves.week_start', $request->week_start);
        } else {
            $latest = $query->clone()->value('week_start');
            if ($latest) {
                $query->where('opname_expired_waves.week_start', $latest);
            }
        }

        $statuses = collect(explode(',', (string) $request->statuses))
            ->filter()
            ->map(fn ($s) => strtoupper(trim($s)))
            ->values()
            ->all();

        if ($request->status) {
            $query->where('opname_expired_waves.status_ini', strtoupper(trim($request->status)));
        } elseif ($statuses) {
            $query->whereIn('opname_expired_waves.status_ini', $statuses);
        }

        if ($request->kode_depo && ! $request->user()->isDepotScoped()) {
            $query->where('opname_expired_waves.kode_depo', $request->kode_depo);
        }

        if ($request->search) {
            $like = '%'.addcslashes($request->search, '\\%_').'%';
            $query->where(function ($q) use ($like) {
                $q->whereRaw('opname_expired_waves.kode_barang LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('opname_expired_waves.nama_barang LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('opname_expired_waves.sumber_material LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp.principal_1 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp_nick.principal_1 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp_sku.principal_1 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp.principal_2 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp_nick.principal_2 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp_sku.principal_2 LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        // Filter sumber data: sj (murni sistem) / import (manual) / mixed.
        // Baris wave lama tanpa source_mix ikut tampil di semua filter
        // (Generate ulang untuk mengisi penandanya).
        $this->applySourceFilter($query, $request->input('source'));

        // Sortir klik-header ala Excel. Allowlist kolom (bukan input mentah
        // ke orderBy — anti SQL injection); tanpa sort = urutan bawaan.
        $sorts = [
            'status' => 'opname_expired_waves.status_ini',
            'produk' => 'opname_expired_waves.kode_barang',
            'depo' => 'opname_expired_waves.nama_depo',
            'principal_1' => 'principal_1',
            'principal_2' => 'principal_2',
            'crt' => 'opname_expired_waves.qty_ini_crt',
            'pcs' => 'opname_expired_waves.qty_ini_pcs',
            'penerimaan' => 'opname_expired_waves.tanggal_penerimaan',
            'expired' => 'opname_expired_waves.expired_date_ini',
            'sisa' => 'opname_expired_waves.sisa_hari',
        ];

        $sortKey = $request->input('sort_by');
        $sortBy = is_string($sortKey) && isset($sorts[$sortKey]) ? $sorts[$sortKey] : null;
        $sortDir = strtolower((string) $request->input('sort_dir', 'asc')) === 'desc' ? 'desc' : 'asc';

        if ($sortBy) {
            $query->orderBy($sortBy, $sortDir)->orderBy('opname_expired_waves.id');
        } else {
            $query->orderByDesc('opname_expired_waves.week_start');
        }

        $perPage = $this->perPage($request);
        $waves = $query->paginate($perPage);

        $weeks = OpnameExpiredWave::query()
            ->when($request->user()->isDepotScoped(), fn ($q) => $q->where('kode_depo', $request->user()->kode_depo))
            ->select('week_start')
            ->distinct()
            ->orderByDesc('week_start')
            ->pluck('week_start');

        $weekStart = $request->week_start ?? $weeks->first();

        $statusSummary = $weekStart ? $this->statusSummary($weekStart, $request) : $this->emptySummary();
        $prevWeekStart = $weekStart ? Carbon::parse($weekStart)->subWeek()->toDateString() : null;
        $prevStatusSummary = $prevWeekStart ? $this->statusSummary($prevWeekStart, $request) : $this->emptySummary();
        $depotSummary = $weekStart ? $this->depotSummary($weekStart, $request) : [];

        return response()->json([
            'data' => $waves,
            'meta' => [
                'weeks' => $weeks,
                'thresholds' => $this->thresholds(),
                'status_summary' => $statusSummary,
                'prev_week_start' => $prevWeekStart,
                'prev_status_summary' => $prevStatusSummary,
                'depot_summary' => $depotSummary,
            ],
        ]);
    }

    public function generate(Request $request, OpnameExpiredService $service): JsonResponse
    {
        $request->validate([
            'week_start' => 'nullable|date',
        ]);

        $weekStart = $request->week_start ? Carbon::parse($request->week_start) : Carbon::today();

        $result = $service->generate($weekStart, $request->user());

        return response()->json([
            'message' => 'Opname expired berhasil dibuat/diperbarui.',
            'data' => $result,
        ]);
    }

    public function pending(Request $request, OpnameExpiredService $service): JsonResponse
    {
        $request->validate([
            'week_start' => 'nullable|date',
        ]);

        $weekStart = $request->week_start ? Carbon::parse($request->week_start) : Carbon::today();

        return response()->json([
            'data' => $service->pendingSummary($weekStart, $request->user()),
        ]);
    }

    /**
     * Progres kirim per depo untuk satu minggu: sudah vs belum kirim.
     * "Sudah" = ada sesi COMPLETED, atau seluruh wave tervalidasi.
     */
    public function progress(Request $request): JsonResponse
    {
        $request->validate([
            'week_start' => 'nullable|date',
        ]);

        $weekStart = $request->week_start
            ? Carbon::parse($request->week_start)->startOfWeek(Carbon::MONDAY)->toDateString()
            : Carbon::today()->startOfWeek(Carbon::MONDAY)->toDateString();

        $user = $request->user();

        // Progres boleh dilihat semua depo oleh pemegang opname.progress_all
        // (chart dashboard) — tanpa itu, depot-scoped hanya depo sendiri.
        $scoped = $user->isDepotScoped() && ! $user->hasPermission('opname.progress_all');

        $waves = OpnameExpiredWave::query()
            ->where('week_start', $weekStart)
            ->when($scoped, fn ($q) => $q->where('kode_depo', $user->kode_depo))
            ->get();

        $completedSessions = OpnameExpiredSession::query()
            ->where('week_start', $weekStart)
            ->where('status', OpnameExpiredSession::STATUS_COMPLETED)
            ->when($scoped, fn ($q) => $q->where('kode_depo', $user->kode_depo))
            ->pluck('kode_depo')
            ->flip();

        $openSessions = OpnameExpiredSession::query()
            ->where('week_start', $weekStart)
            ->whereIn('status', [OpnameExpiredSession::STATUS_OPEN, OpnameExpiredSession::STATUS_IN_PROGRESS])
            ->when($scoped, fn ($q) => $q->where('kode_depo', $user->kode_depo))
            ->pluck('kode_depo')
            ->flip();

        $depots = [];
        foreach ($waves->groupBy('kode_depo') as $depo => $rows) {
            $total = $rows->count();
            $validated = $rows->whereNotNull('validated_by')->count();
            $depots[] = [
                'kode_depo' => $depo,
                'nama_depo' => $rows->first()->nama_depo ?: $depo,
                'total' => $total,
                'validated' => $validated,
                'has_session' => isset($openSessions[$depo]) || isset($completedSessions[$depo]),
                'submitted' => isset($completedSessions[$depo]) || ($total > 0 && $validated === $total),
            ];
        }

        return response()->json([
            'data' => [
                'week_start' => $weekStart,
                'depots' => $depots,
                'submitted_count' => collect($depots)->where('submitted', true)->count(),
                'pending_count' => collect($depots)->where('submitted', false)->count(),
            ],
        ]);
    }

    /**
     * Filter sumber data: sj (murni sistem) / import (manual) / mixed.
     * Baris wave lama tanpa source_mix ikut tampil di semua filter
     * (Generate ulang untuk mengisi penandanya).
     */
    private function applySourceFilter($query, mixed $source): void
    {
        if (! in_array($source, ['sj', 'import', 'mixed'], true)) {
            return;
        }

        $query->where(function ($q) use ($source): void {
            $q->whereNull('opname_expired_waves.source_mix')
                ->orWhere(function ($q) use ($source): void {
                    if ($source === 'sj') {
                        $q->where('opname_expired_waves.source_mix->sj', '>', 0)
                            ->where('opname_expired_waves.source_mix->import', '=', 0);
                    } elseif ($source === 'import') {
                        $q->where('opname_expired_waves.source_mix->import', '>', 0)
                            ->where('opname_expired_waves.source_mix->sj', '=', 0);
                    } else {
                        $q->where('opname_expired_waves.source_mix->sj', '>', 0)
                            ->where('opname_expired_waves.source_mix->import', '>', 0);
                    }
                });
        });
    }

    public function remind(Request $request, EmailNotificationService $emailService): JsonResponse
    {
        $validated = $request->validate([
            'week_start' => 'nullable|date',
            'kode_depo' => 'nullable|string|max:20',
        ]);

        $weekStart = isset($validated['week_start'])
            ? Carbon::parse($validated['week_start'])->startOfWeek(Carbon::MONDAY)->toDateString()
            : Carbon::today()->startOfWeek(Carbon::MONDAY)->toDateString();

        $progressRequest = new Request(['week_start' => $weekStart]);
        $progressRequest->setUserResolver(fn () => $request->user());
        $depots = collect($this->progress($progressRequest)->getData(true)['data']['depots']);

        if (! empty($validated['kode_depo'])) {
            $depots = $depots->where('kode_depo', $validated['kode_depo'])->values();
        }

        $pending = $depots->where('submitted', false)->values()->all();

        abort_unless(count($pending) > 0, 422, 'Semua depo sudah kirim — tidak ada yang perlu diingatkan.');

        $emailService->send(
            'opname_expired',
            'reminder',
            $request->user(),
            new OpnameExpiredNotification('reminder', $weekStart, $pending)
        );

        return response()->json([
            'message' => 'Pengingat dikirim ke '.count($pending).' depo yang belum kirim.',
            'data' => ['reminded' => collect($pending)->pluck('kode_depo')->all()],
        ]);
    }

    public function show(Request $request, OpnameExpiredWave $wave): JsonResponse
    {
        abort_unless(
            $request->user()->canAccessDepotRow($wave->kode_depo, $wave->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );

        return response()->json(['data' => $wave->load('validator')]);
    }

    public function update(Request $request, OpnameExpiredWave $wave): JsonResponse
    {
        abort_unless(
            $request->user()->canAccessDepotRow($wave->kode_depo, $wave->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );

        $validated = $request->validate([
            'qty_koreksi_crt' => 'nullable|numeric|between:-999999,999999',
            'qty_koreksi_pcs' => 'nullable|numeric|between:-9999999,9999999',
        ]);

        $updates = [];

        if (array_key_exists('qty_koreksi_crt', $validated)) {
            $updates['qty_koreksi_crt'] = $validated['qty_koreksi_crt'];
        }

        if (array_key_exists('qty_koreksi_pcs', $validated)) {
            $updates['qty_koreksi_pcs'] = $validated['qty_koreksi_pcs'];
        }

        if ($updates) {
            $updates['koreksi_by'] = $request->user()->id;
            $updates['koreksi_at'] = now();
            $wave->update($updates);
        }

        return response()->json([
            'message' => 'Batch opname diperbarui.',
            'data' => $wave->fresh()->load('validator'),
        ]);
    }

    public function settings(): JsonResponse
    {
        return response()->json(['data' => $this->thresholds()]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'threshold_aman' => 'required|integer|min:1',
            'threshold_perhatian' => 'required|integer|min:1|lte:threshold_aman',
            'threshold_kritis' => 'required|integer|min:1|lte:threshold_perhatian',
        ]);

        foreach ($validated as $key => $value) {
            OpnameSetting::set($key, (int) $value);
        }

        return response()->json([
            'message' => 'Threshold opname diperbarui.',
            'data' => $this->thresholds(),
        ]);
    }

    public function export(Request $request)
    {
        $query = OpnameExpiredWave::query()->orderBy('kode_depo')->orderBy('kode_barang');

        if ($request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->user()->kode_depo);
        }

        if ($request->kode_depo && ! $request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->kode_depo);
        }

        if ($request->week_start) {
            $query->where('week_start', $request->week_start);
        } else {
            $latest = $query->clone()->value('week_start');
            if ($latest) {
                $query->where('week_start', $latest);
            }
        }

        if ($request->status) {
            $query->where('status_ini', $request->status);
        } elseif ($request->statuses) {
            $query->whereIn('status_ini', collect(explode(',', $request->statuses))->map(fn ($s) => strtoupper(trim($s)))->filter()->values()->all());
        }

        $this->applySourceFilter($query, $request->input('source'));

        $filename = 'opname_expired_'.($request->week_start ?? Carbon::today()->toDateString()).'.xlsx';
        ExportGuard::ensureWithinLimit($query);

        return Excel::download(new OpnameExpiredExport($query), $filename);
    }

    private function thresholds(): array
    {
        return [
            'threshold_aman' => OpnameSetting::get('threshold_aman', 90),
            'threshold_perhatian' => OpnameSetting::get('threshold_perhatian', 30),
            'threshold_kritis' => OpnameSetting::get('threshold_kritis', 7),
        ];
    }

    private function emptySummary(): array
    {
        return array_fill_keys(['AMAN', 'PERHATIAN', 'KRITIS', 'EXPIRED'], ['count' => 0, 'qty_crt' => 0]);
    }

    private function statusSummary(string $weekStart, Request $request): array
    {
        $query = OpnameExpiredWave::query()->where('week_start', $weekStart);

        if ($request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->user()->kode_depo);
        }

        if ($request->search) {
            $like = '%'.addcslashes($request->search, '\\%_').'%';
            $query->where(function ($q) use ($like) {
                $q->whereRaw('kode_barang LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('nama_barang LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('sumber_material LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        $summary = $this->emptySummary();

        $query->selectRaw('status_ini, count(*) as c, sum(qty_ini_crt) as qty')
            ->groupBy('status_ini')
            ->get()
            ->each(function ($row) use (&$summary) {
                $summary[$row->status_ini] = [
                    'count' => (int) $row->c,
                    'qty_crt' => (float) ($row->qty ?? 0),
                ];
            });

        return $summary;
    }

    private function depotSummary(string $weekStart, Request $request): array
    {
        $query = OpnameExpiredWave::query()->where('week_start', $weekStart);

        if ($request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->user()->kode_depo);
        }

        if ($request->kode_depo && ! $request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->kode_depo);
        }

        if ($request->search) {
            $like = '%'.addcslashes($request->search, '\\%_').'%';
            $query->where(function ($q) use ($like) {
                $q->whereRaw('kode_barang LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('nama_barang LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('sumber_material LIKE ? ESCAPE ?', [$like, '\\']);
            });
        }

        return $query->selectRaw('kode_depo, nama_depo, status_ini, count(*) as c, sum(qty_ini_crt) as qty')
            ->groupBy('kode_depo', 'nama_depo', 'status_ini')
            ->orderBy('kode_depo')
            ->get()
            ->map(fn ($row) => [
                'kode_depo' => $row->kode_depo,
                'nama_depo' => $row->nama_depo ?: $row->kode_depo,
                'status' => $row->status_ini,
                'count' => (int) $row->c,
                'qty_crt' => (float) ($row->qty ?? 0),
            ])
            ->all();
    }

    public function destroy(Request $request, OpnameExpiredWave $wave): JsonResponse
    {
        abort_unless(
            $request->user()->canAccessDepotRow($wave->kode_depo, $wave->nama_depo),
            403,
            'Anda tidak memiliki akses ke data ini.'
        );

        $wave->delete();

        return response()->json(['message' => 'Wave deleted']);
    }
}
