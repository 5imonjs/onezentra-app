<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\OpnameExpiredExport;
use App\Http\Controllers\Controller;
use App\Mail\OpnameExpiredNotification;
use App\Models\ApprovalHistory;
use App\Models\Batch;
use App\Models\OpnameExpiredSession;
use App\Models\OpnameExpiredSessionItem;
use App\Models\OpnameExpiredWave;
use App\Models\OpnameSetting;
use App\Services\EmailNotificationService;
use App\Services\ExportGuard;
use App\Services\OpnameExpiredService;
use App\Support\LikePattern;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
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
            ->addSelect(DB::raw('COALESCE(cp.principal_1, cp_nick_new.principal_1, cp_nick_old.principal_1, cp_sku.principal_1) as principal_1'))
            ->addSelect(DB::raw('COALESCE(cp.principal_2, cp_nick_new.principal_2, cp_nick_old.principal_2, cp_sku.principal_2) as principal_2'))
            ->leftJoin('npn', 'npn.BOSnetszProductId', '=', 'opname_expired_waves.kode_barang')
            ->leftJoinSub($cpDedup, 'cp_ids', 'cp_ids.bosnetsz_product_id', '=', 'opname_expired_waves.kode_barang')
            ->leftJoin('cluster_principal as cp', 'cp.id', '=', 'cp_ids.id')
            // Nama lama DAN nama baru: gramatik boleh berubah, ID stabil tetap.
            // Dua join terpisah (bukan satu join OR): product_sku unik, tapi
            // satu OR bisa cocok ke 2 baris bila nickname lama & baru sama-sama
            // punya baris CP — menggandakan baris wave. Yang baru menang.
            ->leftJoin('cluster_principal as cp_nick_new', 'cp_nick_new.product_sku', '=', 'npn.szNickNameNew')
            ->leftJoin('cluster_principal as cp_nick_old', function ($join): void {
                $join->on('cp_nick_old.product_sku', '=', 'npn.szNickName')
                    ->whereNull('cp_nick_new.id');
            })
            ->leftJoin('cluster_principal as cp_sku', 'cp_sku.product_sku', '=', 'opname_expired_waves.kode_barang');

        if ($request->user()->isDepotScoped()) {
            $request->user()->applyDepotFilter($query, 'opname_expired_waves.kode_depo');
        }

        // Filter rentang tanggal bebas (dari–sampai) menimpa dropdown minggu.
        // Wave yang dipantau berujung di week_end; sebuah wave tercakup
        // bila minggu monitoringnya bersinggungan dengan rentang.
        $request->validate([
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'stock' => 'nullable|in:kosong_crt,kosong_pcs,kosong_total',
        ]);
        if (
            $request->filled('date_from') &&
            $request->filled('date_to') &&
            Carbon::parse((string) $request->date_to)->startOfDay()
                ->lt(Carbon::parse((string) $request->date_from)->startOfDay())
        ) {
            return response()->json([
                'message' => 'Tanggal akhir tidak boleh mendahului tanggal mulai.',
            ], 422);
        }
        $fromTo = $request->filled('date_from') || $request->filled('date_to');
        if ($fromTo) {
            if ($request->filled('date_to')) {
                $query->where('opname_expired_waves.week_start', '<=', Carbon::parse((string) $request->date_to)->toDateString());
            }
            if ($request->filled('date_from')) {
                $query->where('opname_expired_waves.week_end', '>=', Carbon::parse((string) $request->date_from)->toDateString());
            }
        } elseif ($request->week_start) {
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

        // Hormati filter depo juga untuk user depot-scoped selama depo itu
        // memang dalam cakupannya. Sebelumnya filter diabaikan dan UI harus
        // membuang baris depo lain di sisi klien — pemicu sesi campur depo.
        if ($request->kode_depo && $request->user()->canAccessDepotRow($request->kode_depo)) {
            $query->where('opname_expired_waves.kode_depo', $request->kode_depo);
        }

        $this->applyStockFilter($query, $request);

        if ($request->search) {
            $like = LikePattern::contains($request->search);
            $query->where(function ($q) use ($like) {
                $q->whereRaw('opname_expired_waves.kode_barang LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('opname_expired_waves.nama_barang LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('opname_expired_waves.sumber_material LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp.principal_1 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp_nick_new.principal_1 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp_nick_old.principal_1 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp_sku.principal_1 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp.principal_2 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp_nick_new.principal_2 LIKE ? ESCAPE ?', [$like, '\\'])
                    ->orWhereRaw('cp_nick_old.principal_2 LIKE ? ESCAPE ?', [$like, '\\'])
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
            // FEFO: expired terdekat tampil lebih dulu agar operator tidak
            // memilih lot yang masih panjang umurnya.
            $query->orderBy('opname_expired_waves.expired_date_ini')
                ->orderByDesc('opname_expired_waves.week_start')
                ->orderBy('opname_expired_waves.id');
        }

        $perPage = $this->perPage($request);
        $waves = $query->paginate($perPage);

        // Status batch (ACTIVE/QUARANTINED) tidak tersimpan di wave. Ambil
        // sekali untuk semua lot yang tampil agar panel detail bisa menunjukkan
        // karantina tanpa N+1 query per baris.
        $this->annotateBatchStatus($waves->getCollection());

        // Tandai wave yang sudah dikunci sesi berjalan supaya modal "Buat
        // Sesi" tidak menawarkannya lagi. Backend tetap menolak 422 bila
        // client mengirim wave yang sama (race kondisi).
        $openWaveIds = OpnameExpiredSessionItem::query()
            ->whereIn('wave_id', $waves->getCollection()->pluck('id'))
            ->whereHas('session', fn ($session) => $session->whereIn('status', OpnameExpiredSession::OPEN_STATUSES))
            ->pluck('wave_id')
            ->flip();

        $service = app(OpnameExpiredService::class);
        $waves->getCollection()->transform(function (OpnameExpiredWave $wave) use ($openWaveIds, $service): OpnameExpiredWave {
            $wave->setAttribute('has_open_session', $openWaveIds->has($wave->id));
            $wave->setAttribute(
                'composite_unit',
                $service->compositeUnit((string) $wave->kode_barang),
            );

            return $wave;
        });

        $weeks = OpnameExpiredWave::query()
            ->when($request->user()->isDepotScoped(), fn ($q) => $request->user()->applyDepotFilter($q, 'kode_depo'))
            ->select('week_start')
            ->distinct()
            ->orderByDesc('week_start')
            ->pluck('week_start');

        // Bila mode rentang dipakai, ringkasan dihitung di atas rentang yang
        // sama; bila tidak, jatuh ke minggu tunggal (perilaku lama).
        $byRange = $fromTo && ! $request->week_start;
        $weekStart = $request->week_start ?? $weeks->first();

        $statusSummary = $byRange
            ? $this->statusSummary($request, null, true)
            : ($weekStart ? $this->statusSummary($request, (string) $weekStart) : $this->emptySummary());
        $prevWeekStart = null;
        if (! $byRange && $weekStart) {
            $prevWeekStart = Carbon::parse((string) $weekStart)->subWeek()->toDateString();
        }
        $prevStatusSummary = $prevWeekStart ? $this->statusSummary($request, $prevWeekStart) : $this->emptySummary();
        $depotSummary = $byRange
            ? $this->depotSummary($request, null, true)
            : ($weekStart ? $this->depotSummary($request, (string) $weekStart) : []);

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
     * "Sudah" = seluruh wave depo tervalidasi. Sesi COMPLETED memang menandai
     * semua wave yang dicakupnya tervalidasi, tapi sesi parsial tidak boleh
     * menandai seluruh depo "sudah" — karena itu cek per-wave yang jadi penentu.
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
            ->when($scoped, fn ($q) => $user->applyDepotFilter($q, 'kode_depo'))
            ->get();

        // Sesi "berjalan" = belum ditutup definitif: penghitungan, antrean
        // approval, maupun revisi — wave-nya masih terkunci.
        $openSessions = OpnameExpiredSession::query()
            ->where('week_start', $weekStart)
            ->whereIn('status', OpnameExpiredSession::OPEN_STATUSES)
            ->when($scoped, fn ($q) => $user->applyDepotFilter($q, 'kode_depo'))
            ->get(['id', 'kode_depo'])
            ->keyBy('kode_depo');

        // APPROVED adalah keputusan final; COMPLETED hanya sesi lama pra-approval.
        $completedSessions = OpnameExpiredSession::query()
            ->where('week_start', $weekStart)
            ->whereIn('status', [OpnameExpiredSession::STATUS_APPROVED, OpnameExpiredSession::STATUS_COMPLETED])
            ->when($scoped, fn ($q) => $user->applyDepotFilter($q, 'kode_depo'))
            ->get(['id', 'kode_depo'])
            ->keyBy('kode_depo');

        // Progres hitung fisik diambil dari ITEM SESI (verified_at), bukan dari
        // wave tervalidasi. Wave hanya berubah saat approver menyetujui di web,
        // sehingga dashboard lama diam meski petugas sudah menginput di mobile.
        // Satu query agregat per depo, bukan satu query per item.
        $itemStats = OpnameExpiredSessionItem::query()
            ->join('opname_expired_sessions as ses', 'ses.id', '=', 'opname_expired_session_items.session_id')
            ->where('ses.week_start', $weekStart)
            ->when($scoped, fn ($q) => $user->applyDepotFilter($q, 'ses.kode_depo'))
            ->selectRaw(
                'ses.kode_depo as kode_depo, '
                .'COUNT(*) as item_total, '
                .'SUM(CASE WHEN opname_expired_session_items.verified_at IS NOT NULL THEN 1 ELSE 0 END) as item_counted'
            )
            ->groupBy('ses.kode_depo')
            ->get()
            ->keyBy('kode_depo');

        $depots = [];
        foreach ($waves->groupBy('kode_depo') as $depo => $rows) {
            $total = $rows->count();
            $validated = $rows->whereNotNull('validated_by')->count();
            $openSession = $openSessions->get($depo);
            $completedSession = $completedSessions->get($depo);
            $itemStat = $itemStats->get($depo);
            $itemTotal = (int) ($itemStat->item_total ?? 0);
            $itemCounted = (int) ($itemStat->item_counted ?? 0);
            $depots[] = [
                'kode_depo' => $depo,
                'nama_depo' => $rows->first()->nama_depo ?: $depo,
                'total' => $total,
                'validated' => $validated,
                // Metrik hitungan lapangan — sumber kebenaran untuk dashboard
                // saat input mobile masuk (waktu nyata).
                'item_total' => $itemTotal,
                'item_counted' => $itemCounted,
                'item_pct' => $itemTotal > 0 ? (int) round($itemCounted / $itemTotal * 100) : 0,
                // has_session dipertahankan untuk konsumen lama (chart).
                'has_session' => $openSession !== null || $completedSession !== null,
                'has_open_session' => $openSession !== null,
                'open_session_id' => $openSession?->id,
                'has_finalized_session' => $completedSession !== null,
                'finalized_session_id' => $completedSession?->id,
                'submitted' => $total > 0 && $validated === $total,
            ];
        }

        $itemTotalAll = collect($depots)->sum('item_total');
        $itemCountedAll = collect($depots)->sum('item_counted');

        return response()->json([
            'data' => [
                'week_start' => $weekStart,
                'depots' => $depots,
                'submitted_count' => collect($depots)->where('submitted', true)->count(),
                'pending_count' => collect($depots)->where('submitted', false)->count(),
                'item_total' => $itemTotalAll,
                'item_counted' => $itemCountedAll,
                'item_pct' => $itemTotalAll > 0
                    ? (int) round($itemCountedAll / $itemTotalAll * 100)
                    : 0,
            ],
        ]);
    }

    /**
     * Tambahkan penanda karantina ke baris monitoring yang sedang tampil.
     *
     * Satu query untuk semua nomor batch di halaman ini — bukan satu query
     * per wave. Batch CANCELLED sengaja tidak dihitung sebagai karantina:
     * label itu sudah mati, bukan stok yang diblokir.
     *
     * @param  Collection<int, OpnameExpiredWave>  $waves
     */
    private function annotateBatchStatus(Collection $waves): void
    {
        $allNumbers = $waves
            ->flatMap(fn (OpnameExpiredWave $wave): array => $wave->batch_numbers ?? [])
            ->filter()
            ->unique()
            ->values()
            ->all();

        $quarantinedNumbers = $allNumbers === []
            ? collect()
            : Batch::query()
                ->whereIn('batch_number', $allNumbers)
                ->where('status', Batch::STATUS_QUARANTINED)
                ->pluck('batch_number')
                ->flip();

        foreach ($waves as $wave) {
            $matched = array_values(array_intersect(
                $wave->batch_numbers ?? [],
                $quarantinedNumbers->keys()->all(),
            ));

            $wave->setAttribute('quarantined_batches', $matched);
            $wave->setAttribute('is_quarantined', $matched !== []);
        }
    }

    /**
     * Filter sumber data: sj (murni sistem) / import (manual) / legacy
     * (baseline awal) / mixed. Baris wave lama tanpa source_mix ikut tampil
     * di filter lama (Generate ulang untuk mengisi penandanya).
     */
    private function applySourceFilter($query, mixed $source): void
    {
        if (! in_array($source, ['sj', 'import', 'legacy', 'mixed'], true)) {
            return;
        }

        $query->where(function ($q) use ($source): void {
            if ($source !== 'legacy') {
                $q->whereNull('opname_expired_waves.source_mix');
            }

            $q->orWhere(function ($q) use ($source): void {
                if ($source === 'sj') {
                    $q->where('opname_expired_waves.source_mix->sj', '>', 0)
                        ->where(fn ($x) => $x->where('opname_expired_waves.source_mix->import', '=', 0)
                            ->orWhereNull('opname_expired_waves.source_mix->import'))
                        ->where(fn ($x) => $x->where('opname_expired_waves.source_mix->legacy', '=', 0)
                            ->orWhereNull('opname_expired_waves.source_mix->legacy'));
                } elseif ($source === 'import') {
                    $q->where('opname_expired_waves.source_mix->import', '>', 0)
                        ->where(fn ($x) => $x->where('opname_expired_waves.source_mix->sj', '=', 0)
                            ->orWhereNull('opname_expired_waves.source_mix->sj'))
                        ->where(fn ($x) => $x->where('opname_expired_waves.source_mix->legacy', '=', 0)
                            ->orWhereNull('opname_expired_waves.source_mix->legacy'));
                } elseif ($source === 'legacy') {
                    $q->where('opname_expired_waves.source_mix->legacy', '>', 0)
                        ->where(fn ($x) => $x->where('opname_expired_waves.source_mix->sj', '=', 0)
                            ->orWhereNull('opname_expired_waves.source_mix->sj'))
                        ->where(fn ($x) => $x->where('opname_expired_waves.source_mix->import', '=', 0)
                            ->orWhereNull('opname_expired_waves.source_mix->import'));
                } else {
                    $q->where(function ($any) {
                        $any->where(function ($pair) {
                            $pair->where('opname_expired_waves.source_mix->sj', '>', 0)
                                ->where('opname_expired_waves.source_mix->import', '>', 0);
                        })->orWhere(function ($pair) {
                            $pair->where('opname_expired_waves.source_mix->sj', '>', 0)
                                ->where('opname_expired_waves.source_mix->legacy', '>', 0);
                        })->orWhere(function ($pair) {
                            $pair->where('opname_expired_waves.source_mix->import', '>', 0)
                                ->where('opname_expired_waves.source_mix->legacy', '>', 0);
                        });
                    });
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

        foreach ($pending as $depot) {
            $emailService->send(
                'opname_expired',
                'reminder',
                $request->user(),
                new OpnameExpiredNotification('reminder', $weekStart, [$depot]),
                $depot['kode_depo']
            );
        }

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

        $this->annotateBatchStatus(collect([$wave]));

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
            'reason' => 'required|string|min:10|max:1000',
        ]);

        $updates = [];

        if (array_key_exists('qty_koreksi_crt', $validated)) {
            $updates['qty_koreksi_crt'] = $validated['qty_koreksi_crt'];
        }

        if (array_key_exists('qty_koreksi_pcs', $validated)) {
            $updates['qty_koreksi_pcs'] = $validated['qty_koreksi_pcs'];
        }

        if ($updates) {
            DB::transaction(function () use ($wave, $updates, $validated, $request): void {
                $wave->update(array_merge($updates, [
                    'koreksi_by' => $request->user()->id,
                    'koreksi_at' => now(),
                ]));

                ApprovalHistory::create([
                    'subject_type' => $wave::class,
                    'subject_id' => $wave->id,
                    'from_status' => $wave->status_ini,
                    'to_status' => 'ADJUSTED',
                    'action' => 'manual_adjust',
                    'reason' => $validated['reason'],
                    'actor_id' => $request->user()->id,
                ]);
            });
        }

        return response()->json([
            'message' => 'Batch opname diperbarui.',
            'data' => $wave->fresh()->load('validator'),
        ]);
    }

    public function settings(): JsonResponse
    {
        return response()->json([
            'data' => array_merge($this->thresholds(), [
                'composite_unit' => (bool) OpnameSetting::get('composite_unit', 0),
            ]),
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'threshold_aman' => 'required|integer|min:1',
            'threshold_perhatian' => 'required|integer|min:1|lte:threshold_aman',
            'threshold_kritis' => 'required|integer|min:1|lte:threshold_perhatian',
            'composite_unit' => 'nullable|boolean',
        ]);

        foreach ($validated as $key => $value) {
            if ($key === 'composite_unit') {
                OpnameSetting::set($key, ((bool) $value) ? 1 : 0);

                continue;
            }
            OpnameSetting::set($key, (int) $value);
        }

        return response()->json([
            'message' => 'Pengaturan opname diperbarui.',
            'data' => array_merge($this->thresholds(), [
                'composite_unit' => (bool) OpnameSetting::get('composite_unit', 0),
            ]),
        ]);
    }

    public function export(Request $request)
    {
        $query = OpnameExpiredWave::query()->orderBy('kode_depo')->orderBy('kode_barang');

        if ($request->user()->isDepotScoped()) {
            $request->user()->applyDepotFilter($query, 'kode_depo');
        }

        if ($request->kode_depo && ! $request->user()->isDepotScoped()) {
            $query->where('kode_depo', $request->kode_depo);
        }

        $request->validate([
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'stock' => 'nullable|in:kosong_crt,kosong_pcs,kosong_total',
        ]);
        $fromTo = $request->filled('date_from') || $request->filled('date_to');
        if ($fromTo) {
            $this->applyWaveRange($query, $request);
        } elseif ($request->week_start) {
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
        $this->applyStockFilter($query, $request);

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

    /**
     * Saring stok efektif = qty_ini + qty_koreksi (kolom koreksi bisa null).
     * Dipakai index() & export() supaya daftar dan file Excel konsisten.
     */
    private function applyStockFilter($query, Request $request): void
    {
        $stock = $request->input('stock');
        $crt = '(COALESCE(opname_expired_waves.qty_ini_crt, 0) + COALESCE(opname_expired_waves.qty_koreksi_crt, 0))';
        $pcs = '(COALESCE(opname_expired_waves.qty_ini_pcs, 0) + COALESCE(opname_expired_waves.qty_koreksi_pcs, 0))';

        if ($stock === 'kosong_crt') {
            $query->whereRaw("{$crt} = 0");
        } elseif ($stock === 'kosong_pcs') {
            $query->whereRaw("{$pcs} = 0");
        } elseif ($stock === 'kosong_total') {
            $query->whereRaw("{$crt} = 0")->whereRaw("{$pcs} = 0");
        }
    }

    /**
     * Terapkan filter rentang tanggal (date_from/date_to) — overlap minggu.
     * Wave tercakup bila minggu monitoringnya bersinggungan dengan rentang;
     * week_start tanpa rentang dipakai bila tersedia nilai week_start.
     */
    private function applyWaveRange($query, Request $request): void
    {
        if ($request->filled('date_to')) {
            $query->where('week_start', '<=', Carbon::parse((string) $request->date_to)->toDateString());
        }
        if ($request->filled('date_from')) {
            $query->where('week_end', '>=', Carbon::parse((string) $request->date_from)->toDateString());
        }
        if (! $request->filled('date_to') && ! $request->filled('date_from') && $request->week_start) {
            $query->where('week_start', $request->week_start);
        }
    }

    private function statusSummary(Request $request, ?string $weekStart = null, bool $useRange = false): array
    {
        $query = OpnameExpiredWave::query();

        if ($useRange) {
            $this->applyWaveRange($query, $request);
        } elseif ($weekStart !== null) {
            $query->where('week_start', $weekStart);
        }

        if ($request->user()->isDepotScoped()) {
            $request->user()->applyDepotFilter($query, 'kode_depo');
        }

        if ($request->search) {
            $like = LikePattern::contains($request->search);
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

    private function depotSummary(Request $request, ?string $weekStart = null, bool $useRange = false): array
    {
        // Sumber opsi dropdown filter depo di web. Sengaja TIDAK memakai
        // kode_depo/search dari request: opsi harus tetap lengkap (semua depo
        // pada minggu itu, dalam scope user) walau tabel sedang difilter,
        // supaya dropdown tidak kolaps setelah satu depo dipilih.
        $query = OpnameExpiredWave::query();

        if ($useRange) {
            $this->applyWaveRange($query, $request);
        } elseif ($weekStart !== null) {
            $query->where('week_start', $weekStart);
        }

        if ($request->user()->isDepotScoped()) {
            $request->user()->applyDepotFilter($query, 'kode_depo');
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

        // Grant khusus ini menjaga perlindungan bukti audit tetap terpisah dari
        // izin hapus wave biasa.
        if (! $request->user()->hasPermission('opname.delete_validated')) {
            abort_if(
                $wave->validated_by !== null
                    || $wave->koreksi_by !== null
                    || OpnameExpiredSessionItem::where('wave_id', $wave->id)->exists(),
                422,
                'Wave sudah dipakai pada sesi opname atau sudah divalidasi, sehingga tidak dapat dihapus.'
            );
        }

        $wave->delete();

        return response()->json(['message' => 'Wave deleted']);
    }
}
